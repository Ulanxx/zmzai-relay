import mongoose from "mongoose";

import { cnyYuanToMicros } from "./currency";
import { BalanceAccountModel, BalanceLedgerModel } from "@/providers/database/mongodb/models/balance";

export const WELCOME_CREDIT_MICROS = cnyYuanToMicros(1);

/** 为每个用户发放一次 ¥1 体验额度，重复进入或并发调用都不会重复发放。 */
export async function ensureWelcomeCredit(userId: string): Promise<void> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const account = await BalanceAccountModel.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, balanceMicros: 0, reservedMicros: 0, welcomeGrantedAt: null } },
        { upsert: true, new: true, session },
      );
      if (account.welcomeGrantedAt) return;
      const before = account.balanceMicros;
      account.balanceMicros += WELCOME_CREDIT_MICROS;
      account.welcomeGrantedAt = new Date();
      await account.save({ session });
      await BalanceLedgerModel.create([{
        userId,
        kind: "welcome_credit",
        amountMicros: WELCOME_CREDIT_MICROS,
        balanceBeforeMicros: before,
        balanceAfterMicros: account.balanceMicros,
        usageId: null,
        operatorUserId: null,
        note: "新用户体验额度",
      }], { session });
    });
  } finally {
    await session.endSession();
  }
}
