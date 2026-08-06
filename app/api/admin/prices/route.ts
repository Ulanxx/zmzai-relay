import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AdminRequiredError, requireAdmin } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { AdminAuditModel } from "@/providers/database/mongodb/models/admin-audit";
import { ModelPriceModel, reasoningEfforts } from "@/providers/database/mongodb/models/model-price";

const schema = z.object({ model: z.string().min(1).max(120), inputPricePer1kMicros: z.coerce.number().int().min(0), outputPricePer1kMicros: z.coerce.number().int().min(0), maxInputTokens: z.coerce.number().int().min(1), maxOutputTokens: z.coerce.number().int().min(1), allowedReasoningEfforts: z.array(z.enum(reasoningEfforts)).min(1).default([...reasoningEfforts]), enabled: z.boolean().default(true), reason: z.string().min(1).max(500) });

export async function GET() { try { await requireAdmin(); await connectMongo(); return NextResponse.json({ prices: await ModelPriceModel.find().sort({ model: 1 }).lean() }); } catch (e) { return e instanceof AdminRequiredError ? NextResponse.json({ error: "需要管理员权限", code: "ADMIN_REQUIRED" }, { status: 403 }) : Promise.reject(e); } }
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(); const input = schema.parse(await req.json()); const { reason, ...values } = input; await connectMongo();
    const before = await ModelPriceModel.findOne({ model: input.model }).lean();
    const price = await ModelPriceModel.findOneAndUpdate({ model: input.model }, { $set: values }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await AdminAuditModel.create({ operatorUserId: admin.id, resourceType: "model_price", resourceId: input.model, before, after: price.toObject(), reason });
    return NextResponse.json({ price });
  } catch (e) { return e instanceof AdminRequiredError ? NextResponse.json({ error: "需要管理员权限", code: "ADMIN_REQUIRED" }, { status: 403 }) : NextResponse.json({ error: "价格配置格式不正确", code: "INVALID_BODY" }, { status: 400 }); }
}
