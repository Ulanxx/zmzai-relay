import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateApiKey } from "@/providers/auth/apikey";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ApiKeyModel } from "@/providers/database/mongodb/models/apikey";

const createSchema = z.object({ name: z.string().min(1).max(80), allowedModels: z.array(z.string()).default([]), rateLimitPerMinute: z.coerce.number().int().min(1).max(10_000).default(60), monthlySpendLimitMicros: z.coerce.number().int().min(0).default(0) });
function unauthorized() { return NextResponse.json({ error: "需要登录", code: "UNAUTHENTICATED" }, { status: 401 }); }
export async function GET() { const user = await getCurrentUser(); if (!user) return unauthorized(); await connectMongo(); const keys = await ApiKeyModel.find({ userId: user.id }).sort({ createdAt: -1 }).lean(); return NextResponse.json({ keys }); }
export async function POST(req: NextRequest) { const user = await getCurrentUser(); if (!user) return unauthorized(); const parsed = createSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Token 配置格式不正确", code: "INVALID_BODY" }, { status: 400 }); const created = generateApiKey(); await connectMongo(); const record = await ApiKeyModel.create({ ...parsed.data, keyHash: created.keyHash, prefix: created.prefix, userId: user.id, status: "active", quotaTotalTokens: 0, quotaUsedTokens: 0 }); return NextResponse.json({ key: created.plaintext, record: { _id: String(record._id), prefix: record.prefix, name: record.name, status: record.status } }, { status: 201 }); }
