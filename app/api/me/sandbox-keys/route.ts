import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateSandboxKey } from "@/providers/auth/sandbox-key";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { SandboxKeyModel } from "@/providers/database/mongodb/models/sandbox-key";

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });
const unauthorized = () => NextResponse.json({ code: "UNAUTHENTICATED", error: "需要登录" }, { status: 401 });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  await connectMongo();
  const keys = await SandboxKeyModel.find({ userId: user.id }).sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json({ keys: keys.map((key) => ({ id: String(key._id), prefix: key.prefix, name: key.name, status: key.status, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, revokedAt: key.revokedAt })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY", error: "密钥名称需要在 1 到 80 个字符之间" }, { status: 400 });
  const generated = generateSandboxKey();
  await connectMongo();
  const record = await SandboxKeyModel.create({ ...generated, name: parsed.data.name, userId: user.id, status: "active" });
  return NextResponse.json({ key: generated.plaintext, record: { id: String(record._id), prefix: record.prefix, name: record.name, status: record.status, createdAt: record.createdAt, lastUsedAt: record.lastUsedAt, revokedAt: record.revokedAt } }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
