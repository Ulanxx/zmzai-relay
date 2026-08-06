import { type NextRequest, NextResponse } from "next/server";

import { AdminRequiredError, requireAdmin } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";
import { safeUpstreamFetch } from "@/providers/network/safe-upstream-fetch";

export const dynamic = "force-dynamic";

function err(code: string, status: number, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/** 优先 /models；不支持该端点的上游用最小 completion 验证连通性。 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminRequiredError) return err("ADMIN_REQUIRED", 403, "需要管理员权限");
    throw e;
  }

  const { id } = await params;
  await connectMongo();
  const channel = await ChannelModel.findById(id).select("+apiKey").lean();
  if (!channel) {
    return err("NOT_FOUND", 404, "渠道不存在");
  }

  const startedAt = Date.now();
  try {
    const baseUrl = channel.baseUrl.replace(/\/$/, "");
    const res = await safeUpstreamFetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${channel.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (![404, 405, 501].includes(res.status)) {
      return NextResponse.json({ ok: res.ok, status: res.status, latencyMs: Date.now() - startedAt, mode: "models" });
    }
    const model = channel.models[0]?.upstream;
    if (!model) return err("NO_MODEL", 400, "渠道没有模型映射");
    const completion = await safeUpstreamFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${channel.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      signal: AbortSignal.timeout(20000),
    });
    return NextResponse.json({
      ok: completion.ok,
      status: completion.status,
      latencyMs: Date.now() - startedAt,
      mode: "completion",
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: e instanceof Error ? e.message : "connect failed",
    });
  }
}
