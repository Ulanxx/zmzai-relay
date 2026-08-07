import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/providers/auth/session";
import { getWalletProducts } from "@/providers/billing/wallet-products";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { WalletOrderModel, paymentMethods } from "@/providers/database/mongodb/models/wallet-order";

export const dynamic = "force-dynamic";
const createSchema = z.object({ productId: z.string().min(1).max(80), paymentMethod: z.enum(paymentMethods) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "需要登录", code: "UNAUTHENTICATED" }, { status: 401 });
  await connectMongo();
  const orders = await WalletOrderModel.find({ userId: user.id }).sort({ createdAt: -1 }).limit(30).lean();
  return NextResponse.json({ orders, products: getWalletProducts() });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "需要登录", code: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "订单参数不正确", code: "INVALID_BODY" }, { status: 400 });
  const product = getWalletProducts().find((item) => item.id === parsed.data.productId);
  if (!product) return NextResponse.json({ error: "额度商品不存在", code: "PRODUCT_NOT_FOUND" }, { status: 404 });
  await connectMongo();
  const order = await WalletOrderModel.create({
    orderNo: `ZMZ${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 6).toUpperCase()}`,
    userId: user.id,
    productId: product.id,
    productName: product.name,
    creditMicros: product.creditMicros,
    paymentAmountFen: product.paymentAmountFen,
    paymentMethod: parsed.data.paymentMethod,
    status: "pending",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  return NextResponse.json({ order: order.toObject() }, { status: 201 });
}
