import { redirect } from "next/navigation";

import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { getWalletProducts } from "@/providers/billing/wallet-products";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { WalletOrderModel } from "@/providers/database/mongodb/models/wallet-order";
import { WalletPanel } from "../wallet-panel";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/billing")}`);
  await connectMongo();
  const orders = await WalletOrderModel.find({ userId: user.id }).sort({ createdAt: -1 }).limit(30).lean();
  return <RelayShell role="user" userName={user.name}><p className="eyebrow">额度充值</p><h1 className="headline mt-2 text-4xl">申请一笔可用余额</h1><p className="mt-3 max-w-2xl text-ink/70">选择额度包后使用微信或支付宝付款。当前为人工核对流程，到账以收款账户记录为准。</p><div className="mt-8"><WalletPanel products={getWalletProducts()} initialOrders={orders.map((order) => ({ ...order, _id: String(order._id), expiresAt: order.expiresAt.toISOString(), submittedAt: order.submittedAt?.toISOString() ?? null, completedAt: order.completedAt?.toISOString() ?? null, paidAt: order.paidAt?.toISOString() ?? null, reviewedAt: order.reviewedAt?.toISOString() ?? null, reviewedBy: order.reviewedBy ? String(order.reviewedBy) : null }))} qrUrl={process.env.NEXT_PUBLIC_PAYMENT_QR_URL ?? ""} accountName={process.env.NEXT_PUBLIC_PAYMENT_ACCOUNT_NAME ?? "管理员收款账户"} notice={process.env.NEXT_PUBLIC_PAYMENT_NOTICE ?? "付款备注填写订单号，完成付款后提交。"} /></div></RelayShell>;
}
