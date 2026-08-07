import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { WalletOrderModel, paymentMethods } from "@/providers/database/mongodb/models/wallet-order";

const schema = z.object({
  paymentMethod: z.enum(paymentMethods),
  paidAmountFen: z.coerce.number().int().min(1),
  payerName: z.string().trim().max(100).optional().or(z.literal("")),
  screenshotUrl: z.string().url().max(2000).optional().or(z.literal("")),
  paymentNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "需要登录", code: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "付款信息不正确", code: "INVALID_BODY" }, { status: 400 });
  const { id } = await params;
  await connectMongo();
  const order = await WalletOrderModel.findOne({ _id: id, userId: user.id });
  if (!order) return NextResponse.json({ error: "订单不存在", code: "NOT_FOUND" }, { status: 404 });
  if (order.status !== "pending") return NextResponse.json({ error: "当前订单不可提交付款", code: "ORDER_NOT_PENDING" }, { status: 409 });
  if (order.expiresAt.getTime() <= Date.now()) {
    order.status = "expired";
    await order.save();
    return NextResponse.json({ error: "订单已过期，请重新下单", code: "ORDER_EXPIRED" }, { status: 409 });
  }
  order.paymentMethod = parsed.data.paymentMethod;
  order.payerName = parsed.data.payerName || null;
  order.screenshotUrl = parsed.data.screenshotUrl || null;
  order.paymentNote = parsed.data.paymentNote || null;
  order.submittedAt = new Date();
  order.status = "submitted";
  await order.save();
  return NextResponse.json({ order: order.toObject() });
}
