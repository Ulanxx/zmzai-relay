import { createHash, randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/config/env";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";
import { UsageModel } from "@/providers/database/mongodb/models/usage";

export const dynamic = "force-dynamic";

const chatSchema = z
  .object({
    model: z.string().min(1),
    messages: z
      .array(z.object({ role: z.string(), content: z.string() }))
      .min(1),
    stream: z.boolean().optional().default(false),
    requestId: z.string().max(128).optional(),
  })
  .strict()
  .passthrough(); // 透传 temperature/max_tokens 等额外字段给上游

function err(code: string, status: number, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return err("UNAUTHENTICATED", 401, "请先登录 muzhi 账号");
  }

  const body = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_BODY", 400, "请求体格式不正确");
  }
  const { model, stream } = parsed.data;
  const requestId = parsed.data.requestId ?? randomUUID();

  await connectMongo();

  // 选渠道：enabled + 支持该模型，按 priority 升序（便宜的排前）
  const channels = await ChannelModel.find({
    enabled: true,
    "models.public": model,
  })
    .select("+apiKey")
    .sort({ priority: 1 })
    .lean();

  if (channels.length === 0) {
    return err("MODEL_UNKNOWN", 400, `没有任何渠道支持模型 ${model}`);
  }

  const channel = channels[0];
  const mapping = channel.models.find((m) => m.public === model);
  const upstreamModel = mapping?.upstream ?? model;

  const startedAt = Date.now();
  const env = getServerEnv();

  // 构造上游请求（openai-compat：透传 body，换 base_url/key/model）
  const upstreamUrl = `${channel.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const upstreamBody = JSON.stringify({
    ...parsed.data,
    model: upstreamModel,
    requestId: undefined,
  });

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channel.apiKey}`,
        "Content-Type": "application/json",
      },
      body: upstreamBody,
      signal: AbortSignal.timeout(channel.timeoutMs ?? env.RELAY_DEFAULT_UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    await recordUsage({
      requestId, userId: user.id, channelId: String(channel._id),
      model, upstreamModel, status: "failed",
      latencyMs: Date.now() - startedAt,
      lastError: e instanceof Error ? e.message : "upstream connect failed",
    });
    return err("UPSTREAM_ERROR", 502, "上游渠道连接失败");
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    await recordUsage({
      requestId, userId: user.id, channelId: String(channel._id),
      model, upstreamModel, status: "failed",
      latencyMs: Date.now() - startedAt,
      lastError: `upstream ${upstream.status}: ${text.slice(0, 300)}`,
    });
    return err("UPSTREAM_ERROR", 502, `上游渠道返回 ${upstream.status}`);
  }

  // 流式：透传 SSE，流结束后记账
  if (stream && upstream.body) {
    const channelId = String(channel._id);
    const costPer1k = channel.costPer1kTokensMicros ?? 0;
    const streamOut = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let usage = { prompt: 0, completion: 0, total: 0 };
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            controller.enqueue(value);
            usage = extractUsage(buffer) ?? usage;
          }
          controller.close();
          await recordUsage({
            requestId, userId: user.id, channelId, model, upstreamModel,
            status: "completed", latencyMs: Date.now() - startedAt,
            promptTokens: usage.prompt, completionTokens: usage.completion,
            totalTokens: usage.total, costPer1k,
          });
        } catch (e) {
          controller.error(e);
          await recordUsage({
            requestId, userId: user.id, channelId, model, upstreamModel,
            status: "failed", latencyMs: Date.now() - startedAt,
            lastError: e instanceof Error ? e.message : "stream error",
          });
        }
      },
    });
    return new NextResponse(streamOut, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // 非流式：读 JSON，取 usage，记账后透传
  const json = await upstream.json().catch(() => null);
  const usage = json?.usage ?? {};
  await recordUsage({
    requestId, userId: user.id, channelId: String(channel._id),
    model, upstreamModel, status: "completed",
    latencyMs: Date.now() - startedAt,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    costPer1k: channel.costPer1kTokensMicros ?? 0,
  });
  return NextResponse.json(json ?? { error: "empty upstream response" });
}

/** 从 SSE 缓冲里抓 usage（OpenAI 兼容的 stream_options.include_usage）。 */
function extractUsage(buffer: string) {
  const matches = [...buffer.matchAll(/"usage"\s*:\s*(\{[^}]*\})/g)];
  if (matches.length === 0) return null;
  try {
    const u = JSON.parse(matches[matches.length - 1][1]);
    return {
      prompt: u.prompt_tokens ?? 0,
      completion: u.completion_tokens ?? 0,
      total: u.total_tokens ?? 0,
    };
  } catch {
    return null;
  }
}

async function recordUsage(input: {
  requestId: string;
  userId: string;
  channelId: string;
  model: string;
  upstreamModel: string;
  status: "completed" | "failed";
  latencyMs: number;
  lastError?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costPer1k?: number;
}) {
  try {
    const total = input.totalTokens ?? 0;
    const costMicros = Math.round((total / 1000) * (input.costPer1k ?? 0));
    await UsageModel.findOneAndUpdate(
      { userId: input.userId, requestId: input.requestId },
      {
        $set: {
          channelId: input.channelId,
          model: input.model,
          upstreamModel: input.upstreamModel,
          status: input.status,
          promptTokens: input.promptTokens ?? 0,
          completionTokens: input.completionTokens ?? 0,
          totalTokens: total,
          costMicros,
          latencyMs: input.latencyMs,
          lastError: input.lastError ?? null,
        },
      },
      { upsert: true, new: true },
    );
  } catch {
    // 记账失败不影响响应，降级 console
    console.error("recordUsage failed", input.requestId);
  }
}
