import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateApiKey } from "@/providers/auth/apikey";
import { AdminRequiredError, requireAdmin } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ApiKeyModel } from "@/providers/database/mongodb/models/apikey";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  quotaTotalTokens: z.coerce.number().min(0).default(0),
  rateLimitPerMinute: z.coerce.number().int().min(1).default(60),
  allowedModels: z.array(z.string()).optional().default([]),
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
  const keys = await ApiKeyModel.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminRequiredError) return err("ADMIN_REQUIRED", 403, "需要管理员权限");
    throw e;
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_BODY", 400, "key 配置格式不正确");
  }

  const { plaintext, keyHash, prefix } = generateApiKey();
  await connectMongo();
  const created = await ApiKeyModel.create({
    ...parsed.data,
    keyHash,
    prefix,
    status: "active",
  });

  // 明文只在这一次返回
  return NextResponse.json(
    {
      key: plaintext,
      record: {
        _id: String(created._id),
        prefix: created.prefix,
        name: created.name,
        status: created.status,
        quotaTotalTokens: created.quotaTotalTokens,
        rateLimitPerMinute: created.rateLimitPerMinute,
        allowedModels: created.allowedModels,
      },
    },
    { status: 201 },
  );
}
