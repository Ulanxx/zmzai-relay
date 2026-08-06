import { type NextRequest, NextResponse } from "next/server";

import { AdminRequiredError, requireAdmin } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";

export const dynamic = "force-dynamic";

function err(code: string, status: number, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/** 测试渠道：实际调一次该渠道的 /models 看通不通。 */
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
    const res = await fetch(`${channel.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${channel.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - startedAt,
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
