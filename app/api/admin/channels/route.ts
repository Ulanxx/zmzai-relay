import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AdminRequiredError, requireAdmin } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";

export const dynamic = "force-dynamic";

const channelSchema = z.object({
  name: z.string().min(1).max(80),
  baseUrl: z.string().url().max(500),
  apiKey: z.string().min(1),
  models: z
    .array(z.object({ public: z.string().min(1), upstream: z.string().min(1) }))
    .min(1),
  priority: z.coerce.number().int().min(0).default(10),
  costPer1kTokensMicros: z.coerce.number().min(0).default(0),
  enabled: z.boolean().optional().default(true),
  timeoutMs: z.coerce.number().int().min(1000).max(300000).default(60000),
});

function err(code: string, status: number, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminRequiredError) return err("ADMIN_REQUIRED", 403, "需要管理员权限");
    throw e;
  }
  await connectMongo();
  // 不返回 apiKey 明文
  const channels = await ChannelModel.find().sort({ priority: 1 }).lean();
  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminRequiredError) return err("ADMIN_REQUIRED", 403, "需要管理员权限");
    throw e;
  }

  const body = await req.json().catch(() => null);
  const parsed = channelSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_BODY", 400, "渠道配置格式不正确");
  }

  await connectMongo();
  const created = await ChannelModel.create({
    ...parsed.data,
    protocol: "openai-compat",
  });
  const { apiKey: _omit, ...safe } = created.toObject();
  return NextResponse.json({ channel: safe }, { status: 201 });
}
