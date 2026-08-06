import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import mongoose from "mongoose";
import { AdminRequiredError, requireAdmin } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { AdminAuditModel } from "@/providers/database/mongodb/models/admin-audit";
import { BalanceAccountModel, BalanceLedgerModel } from "@/providers/database/mongodb/models/balance";

const schema = z.object({ userId: z.string(), amountMicros: z.coerce.number().int().refine((value) => value !== 0), reason: z.string().min(1).max(500) });
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(); const input = schema.parse(await req.json()); await connectMongo(); const session = await mongoose.startSession();
    try { let after = 0; await session.withTransaction(async () => { const account = await BalanceAccountModel.findOneAndUpdate({ userId: input.userId }, { $setOnInsert: { userId: input.userId, balanceMicros: 0, reservedMicros: 0 } }, { upsert: true, new: true, session }); if (account.balanceMicros + input.amountMicros < account.reservedMicros) throw new Error("余额不能低于已预留金额"); const before = account.balanceMicros; account.balanceMicros += input.amountMicros; after = account.balanceMicros; await account.save({ session }); await BalanceLedgerModel.create([{ userId: input.userId, kind: input.amountMicros > 0 ? "admin_credit" : "admin_debit", amountMicros: input.amountMicros, balanceBeforeMicros: before, balanceAfterMicros: after, usageId: null, operatorUserId: admin.id, note: input.reason }], { session }); }); await AdminAuditModel.create({ operatorUserId: admin.id, resourceType: "balance", resourceId: input.userId, before: null, after: { amountMicros: input.amountMicros, balanceMicros: after }, reason: input.reason }); return NextResponse.json({ balanceMicros: after }); } finally { await session.endSession(); }
  } catch (e) { return e instanceof AdminRequiredError ? NextResponse.json({ error: "需要管理员权限", code: "ADMIN_REQUIRED" }, { status: 403 }) : NextResponse.json({ error: e instanceof Error ? e.message : "余额调整失败", code: "INVALID_BODY" }, { status: 400 }); }
}
