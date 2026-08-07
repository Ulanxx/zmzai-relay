import { type NextRequest, NextResponse } from "next/server";

import { AdminRequiredError, requireAdmin } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { UserModel } from "@/providers/database/mongodb/models/user";
import { WalletOrderModel, walletOrderStatuses } from "@/providers/database/mongodb/models/wallet-order";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch (error) { if (error instanceof AdminRequiredError) return NextResponse.json({ error: "需要管理员权限", code: "ADMIN_REQUIRED" }, { status: 403 }); throw error; }
  await connectMongo();
  const requestedStatus = new URL(req.url).searchParams.get("status");
  const status = requestedStatus && walletOrderStatuses.includes(requestedStatus as (typeof walletOrderStatuses)[number]) ? requestedStatus : undefined;
  const orders = await WalletOrderModel.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(100).lean();
  const users = await UserModel.find({ _id: { $in: orders.map((order) => order.userId) } }).select("name email").lean();
  const userMap = new Map(users.map((user) => [String(user._id), { name: user.name, email: user.email }]));
  return NextResponse.json({ orders: orders.map((order) => ({ ...order, user: userMap.get(String(order.userId)) ?? null })) });
}
