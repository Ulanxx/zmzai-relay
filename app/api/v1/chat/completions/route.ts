import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isSandboxServiceAuthorization, resolveSandboxKey } from "@/providers/auth/sandbox-key";
import { isAgentServiceAuthorization } from "@/providers/auth/agent-service";
import { resolveApiKey } from "@/providers/auth/apikey";
import { getCurrentUser } from "@/providers/auth/session";
import { UserModel } from "@zmzai/db";
import { chargeMicros, maximumChargeMicros, reserveBalance, releaseReservation, settleReservation, BillingError } from "@/providers/billing/service";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelAttemptModel } from "@/providers/database/mongodb/models/channel-attempt";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";
import { ModelPriceModel, reasoningEfforts, supportedModels } from "@/providers/database/mongodb/models/model-price";
import { RateLimitBucketModel } from "@/providers/database/mongodb/models/rate-limit";
import { UsageModel } from "@/providers/database/mongodb/models/usage";
import { safeUpstreamFetch } from "@/providers/network/safe-upstream-fetch";

export const dynamic = "force-dynamic";

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.string().nullable(),
}).passthrough();

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  reasoning_effort: z.enum(reasoningEfforts).optional(),
  requestId: z.string().max(128).optional(),
}).strict().passthrough();

type Caller = { kind: "apikey" | "session" | "sandbox_key" | "agent_service"; id: string; userId: string; label: string; allowedModels: string[] | null; rpm: number | null; taskRunId: string | null };
function error(code: string, status: number, message: string) { return NextResponse.json({ error: message, code }, { status }); }

async function logRejectedRequest(caller: Caller, model: string, message: string, requestId?: string) {
  const id = requestId ?? randomUUID();
  await UsageModel.updateOne(
    { callerKind: caller.kind, callerId: caller.id, requestId: id },
    { $setOnInsert: { requestId: id, userId: caller.userId, apiKeyId: caller.kind === "apikey" ? caller.id : null, sandboxKeyId: caller.kind === "sandbox_key" ? caller.id : null, callerKind: caller.kind, callerId: caller.id, taskRunId: caller.taskRunId, channelId: null, model: model || "unknown", upstreamModel: "not-routed", status: "failed", lastError: message } },
    { upsert: true },
  );
}

async function callerFor(req: NextRequest): Promise<Caller | null> {
  const agentUserId = req.headers.get("x-zmzai-agent-user-id");
  if (agentUserId && isAgentServiceAuthorization(req.headers.get("authorization"))) {
    await connectMongo();
    const user = await UserModel.findById(agentUserId).lean();
    if (!user || user.status !== "active" || (!user.emailVerified && user.role !== "admin")) return null;
    return { kind: "agent_service", id: `agent:${user._id}`, userId: String(user._id), label: "a.zmzai.cloud", allowedModels: null, rpm: 60, taskRunId: req.headers.get("x-zmzai-agent-task-run-id")?.slice(0, 128) ?? null };
  }
  const sandboxKey = req.headers.get("x-zmzai-sandbox-key");
  if (sandboxKey && isSandboxServiceAuthorization(req.headers.get("authorization"))) {
    const key = await resolveSandboxKey(sandboxKey);
    return key ? { kind: "sandbox_key", id: key.id, userId: key.userId, label: key.name, allowedModels: null, rpm: 60, taskRunId: null } : null;
  }
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const key = await resolveApiKey(auth.slice(7).trim());
    return key ? { kind: "apikey", id: key.id, userId: key.userId, label: key.name, allowedModels: key.allowedModels.length ? key.allowedModels : null, rpm: key.rateLimitPerMinute, taskRunId: null } : null;
  }
  const user = await getCurrentUser();
  return user ? { kind: "session", id: user.id, userId: user.id, label: user.name, allowedModels: null, rpm: null, taskRunId: null } : null;
}

async function consumeRateLimit(keyId: string, limit: number): Promise<boolean> {
  const now = new Date();
  now.setSeconds(0, 0);
  const bucket = await RateLimitBucketModel.findOneAndUpdate(
    { keyId, windowStart: now }, { $inc: { count: 1 }, $setOnInsert: { keyId, windowStart: now } }, { upsert: true, new: true },
  );
  return bucket.count <= limit;
}

export async function POST(req: NextRequest) {
  const caller = await callerFor(req);
  if (!caller) return error("UNAUTHENTICATED", 401, "需要有效的 API Token 或登录会话");
  const body = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) return error("INVALID_BODY", 400, "请求体格式不正确");
  const requestedMaxTokens = parsed.data.max_tokens ?? parsed.data.max_output_tokens ?? parsed.data.max_completion_tokens;
  if (requestedMaxTokens && !parsed.data.max_tokens) parsed.data.max_tokens = requestedMaxTokens;
  if (caller.allowedModels && !caller.allowedModels.includes(parsed.data.model)) return error("MODEL_NOT_ALLOWED", 403, "此 Token 不允许调用该模型");
  if ((caller.kind === "apikey" || caller.kind === "sandbox_key" || caller.kind === "agent_service") && !(await consumeRateLimit(caller.id, caller.rpm ?? 60))) return error("RATE_LIMITED", 429, "此调用方已达到每分钟调用上限");

  await connectMongo();
  if (!(supportedModels as readonly string[]).includes(parsed.data.model)) {
    await logRejectedRequest(caller, parsed.data.model, "该模型不在当前开放目录", parsed.data.requestId);
    return error("MODEL_NOT_FOUND", 400, "该模型不在当前开放目录");
  }
  const price = await ModelPriceModel.findOne({ model: parsed.data.model, enabled: true }).lean();
  if (!price) return error("MODEL_NOT_PRICED", 400, "该模型尚未开放或未配置价格");
  if (parsed.data.reasoning_effort && !price.allowedReasoningEfforts.includes(parsed.data.reasoning_effort)) return error("REASONING_EFFORT_NOT_ALLOWED", 400, "该模型不支持此推理强度");
  if ((parsed.data.max_tokens ?? 4096) > price.maxOutputTokens) {
    const message = `max_tokens 超过该模型允许的上限（${price.maxOutputTokens}）`;
    await logRejectedRequest(caller, parsed.data.model, message, parsed.data.requestId);
    return error("MAX_TOKENS_EXCEEDED", 400, message);
  }
  if (Buffer.byteLength(JSON.stringify(parsed.data.messages), "utf8") > 128 * 1024) return error("PROMPT_TOO_LARGE", 400, "消息内容超过 128 KiB 限制");

  const requestId = parsed.data.requestId ?? randomUUID();
  const existing = await UsageModel.findOne({ callerKind: caller.kind, callerId: caller.id, requestId }).lean();
  if (existing) return error(existing.status === "processing" ? "REQUEST_IN_PROGRESS" : "REQUEST_ALREADY_PROCESSED", 409, "此 requestId 已处理，不能重复调用");

  const usage = await UsageModel.create({ requestId, userId: caller.userId, apiKeyId: caller.kind === "apikey" ? caller.id : null, sandboxKeyId: caller.kind === "sandbox_key" ? caller.id : null, callerKind: caller.kind, callerId: caller.id, taskRunId: caller.taskRunId, channelId: null, model: parsed.data.model, upstreamModel: "pending", status: "processing" });
  const reserved = maximumChargeMicros(price);
  try { await reserveBalance({ usageId: usage._id, userId: caller.userId, apiKeyId: caller.kind === "apikey" ? caller.id : null, amountMicros: reserved }); }
  catch (e) {
    await UsageModel.deleteOne({ _id: usage._id });
    if (e instanceof BillingError) return error(e.code, 402, e.message);
    throw e;
  }

  const channels = await ChannelModel.find({ enabled: true, "models.public": parsed.data.model }).select("+apiKey").sort({ priority: 1 }).lean();
  if (!channels.length) { await releaseReservation(usage._id); await UsageModel.updateOne({ _id: usage._id }, { $set: { status: "failed", lastError: "no eligible channel" } }); return error("NO_CHANNEL", 503, "没有可用上游渠道"); }

  for (const channel of channels) {
    const upstreamModel = channel.models.find((item) => item.public === parsed.data.model)?.upstream ?? parsed.data.model;
    const started = Date.now();
    try {
      // 建连/首字节超时：仅覆盖 TCP+TLS+首字节阶段（默认 60s 足够建连）。
      // 不再用整体倒计时覆盖流式读取——长输出（如 PPT 的几百行脚本）
      // 会被无脑切断并透传底层 "terminated"。流读取的卡死保护由
      // streamResponse 里的 idle watchdog（120s 无新数据才中断）负责。
      const upstream = await safeUpstreamFetch(`${channel.baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${channel.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...parsed.data, model: upstreamModel, requestId: undefined, stream_options: parsed.data.stream ? { include_usage: true } : undefined }), signal: AbortSignal.timeout(channel.timeoutMs) });
      if (!upstream.ok) {
        const details = (await upstream.text().catch(() => "")).slice(0, 500);
        await ChannelAttemptModel.create({ usageId: usage._id, channelId: channel._id, upstreamModel, status: "failed", latencyMs: Date.now() - started, error: `HTTP ${upstream.status}: ${details}`, costStatus: "not_charged" });
        continue;
      }
      if (parsed.data.stream && upstream.body) return streamResponse(upstream.body, usage._id, channel, upstreamModel, price, started);
      const json = await upstream.json().catch(() => null);
      const tokens = json?.usage;
      if (!tokens) { await releaseReservation(usage._id); await UsageModel.updateOne({ _id: usage._id }, { $set: { status: "unsettled", lastError: "upstream omitted usage" } }); return error("USAGE_UNAVAILABLE", 502, "上游未返回用量，已取消扣费"); }
      const prompt = tokens.prompt_tokens ?? 0; const completion = tokens.completion_tokens ?? 0;
      const charged = chargeMicros(prompt, price.inputPricePer1kMicros) + chargeMicros(completion, price.outputPricePer1kMicros);
      const costConfigured = channel.inputCostPer1kTokensMicros !== null && channel.outputCostPer1kTokensMicros !== null;
      const cost = costConfigured ? chargeMicros(prompt, channel.inputCostPer1kTokensMicros ?? 0) + chargeMicros(completion, channel.outputCostPer1kTokensMicros ?? 0) : 0;
      await ChannelAttemptModel.create({ usageId: usage._id, channelId: channel._id, upstreamModel, status: "completed", latencyMs: Date.now() - started, error: null, costStatus: costConfigured ? "known" : "unknown" });
      await settleReservation(usage._id, { chargedMicros: charged, costMicros: cost, promptTokens: prompt, completionTokens: completion, channelId: channel._id, upstreamModel, latencyMs: Date.now() - started, inputPricePer1kMicros: price.inputPricePer1kMicros, outputPricePer1kMicros: price.outputPricePer1kMicros, inputCostPer1kTokensMicros: channel.inputCostPer1kTokensMicros ?? 0, outputCostPer1kTokensMicros: channel.outputCostPer1kTokensMicros ?? 0 });
      return NextResponse.json(json);
    } catch (e) { await ChannelAttemptModel.create({ usageId: usage._id, channelId: channel._id, upstreamModel, status: "failed", latencyMs: Date.now() - started, error: e instanceof Error ? e.message.slice(0, 500) : "network failure", costStatus: "unknown" }); }
  }
  await releaseReservation(usage._id); await UsageModel.updateOne({ _id: usage._id }, { $set: { status: "failed", lastError: "all eligible channels failed" } });
  return error("UPSTREAM_ERROR", 502, "所有上游渠道均不可用");
}

/** 流式 idle 超时：只要在此时长内收到过新数据就重置计时；连续无新数据
 *  才判定为死连接。活跃的长输出（如几百行脚本）不会被误杀。 */
const UPSTREAM_STREAM_IDLE_TIMEOUT_MS = 120_000;

function streamResponse(body: ReadableStream<Uint8Array>, usageId: import("mongoose").Types.ObjectId, channel: { _id: import("mongoose").Types.ObjectId; inputCostPer1kTokensMicros: number | null; outputCostPer1kTokensMicros: number | null }, upstreamModel: string, price: { inputPricePer1kMicros: number; outputPricePer1kMicros: number }, started: number) {
  const stream = new ReadableStream<Uint8Array>({ async start(controller) {
    const reader = body.getReader(); const decoder = new TextDecoder(); let raw = "";
    try { for (;;) {
      // idle watchdog：每次 read 最多等 IDLE_TIMEOUT，有新数据即重置。
      // 用 setTimeout + reject，read 成功后 clearTimeout 干净清理。
      let timer: NodeJS.Timeout | undefined;
      const idleTimeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("UPSTREAM_STREAM_IDLE_TIMEOUT")), UPSTREAM_STREAM_IDLE_TIMEOUT_MS); });
      let next: ReadableStreamReadResult<Uint8Array>;
      try { next = await Promise.race([reader.read(), idleTimeout]); }
      finally { if (timer) clearTimeout(timer); }
      if (next.done) break; raw += decoder.decode(next.value, { stream: true }); controller.enqueue(next.value);
    }
      raw += decoder.decode();
      let value: { prompt_tokens?: number; completion_tokens?: number } | null = null;
      for (const line of raw.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try { const event = JSON.parse(payload); if (event.usage) value = event.usage; } catch { /* Ignore malformed non-usage events already sent to the client. */ }
      }
      if (!value) { await releaseReservation(usageId); await UsageModel.updateOne({ _id: usageId }, { $set: { status: "unsettled", lastError: "stream omitted usage" } }); }
      else { const prompt = value.prompt_tokens ?? 0; const completion = value.completion_tokens ?? 0; const charged = chargeMicros(prompt, price.inputPricePer1kMicros) + chargeMicros(completion, price.outputPricePer1kMicros); const costConfigured = channel.inputCostPer1kTokensMicros !== null && channel.outputCostPer1kTokensMicros !== null; const inputCost = channel.inputCostPer1kTokensMicros ?? 0; const outputCost = channel.outputCostPer1kTokensMicros ?? 0; const cost = costConfigured ? chargeMicros(prompt, inputCost) + chargeMicros(completion, outputCost) : 0; await ChannelAttemptModel.create({ usageId, channelId: channel._id, upstreamModel, status: "completed", latencyMs: Date.now() - started, error: null, costStatus: costConfigured ? "known" : "unknown" }); await settleReservation(usageId, { chargedMicros: charged, costMicros: cost, promptTokens: prompt, completionTokens: completion, channelId: channel._id, upstreamModel, latencyMs: Date.now() - started, inputPricePer1kMicros: price.inputPricePer1kMicros, outputPricePer1kMicros: price.outputPricePer1kMicros, inputCostPer1kTokensMicros: inputCost, outputCostPer1kTokensMicros: outputCost }); }
      controller.close();
    } catch (e) { await releaseReservation(usageId); const isIdle = e instanceof Error && e.message.includes("IDLE_TIMEOUT"); const reason = isIdle ? "上游流 120s 无数据（idle 超时），疑似死连接" : (e instanceof Error ? e.message : "上游流读取失败"); await UsageModel.updateOne({ _id: usageId }, { $set: { status: "failed", lastError: reason } }); controller.error(new Error(reason)); }
  }});
  return new NextResponse(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
