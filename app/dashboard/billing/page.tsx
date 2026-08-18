import { redirect } from "next/navigation";

import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { BalanceAccountModel } from "@/providers/database/mongodb/models/balance";
import { ensureWelcomeCredit } from "@/providers/billing/onboarding";
import { getWalletProducts } from "@/providers/billing/wallet-products";
import { cnyFenLabel, cnyMicrosLabel } from "@/providers/billing/currency";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/billing")}`);
  await connectMongo();
  await ensureWelcomeCredit(user.id);
  const account = await BalanceAccountModel.findOne({ userId: user.id }).lean();
  const products = getWalletProducts();
  const supportWechat = process.env.NEXT_PUBLIC_SUPPORT_WECHAT;
  const availableMicros = Math.max(0, (account?.balanceMicros ?? 0) - (account?.reservedMicros ?? 0));
  return (
    <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}>
      <h1 className="text-2xl font-semibold tracking-tight">额度充值</h1>
      <p className="mt-2 text-sm text-ink-2">余额按调用实际用量扣减。首次进入会自动获得 ¥1 体验额度。</p>

      <div className="mt-6 max-w-md rounded-lg border border-line bg-bg p-5">
        <p className="font-mono text-xs text-muted">当前可用余额</p>
        <p className="mt-2 font-mono text-3xl">{cnyMicrosLabel(availableMicros)}</p>
      </div>

      <h2 className="mt-10 text-lg font-semibold">额度包</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
              <th className="px-4 py-2.5 font-normal">额度包</th>
              <th className="px-4 py-2.5 text-right font-normal">到账额度</th>
              <th className="px-4 py-2.5 text-right font-normal">支付金额</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((product) => (
              <tr key={product.id}>
                <td className="px-4 py-3">{product.name}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{cnyMicrosLabel(product.creditMicros, 2)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{cnyFenLabel(product.paymentAmountFen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-lg font-semibold">充值方式</h2>
      <div className="mt-3 max-w-xl rounded-lg border border-line bg-bg p-5">
        <p className="text-sm leading-6 text-ink-2">
          目前充值为人工核对流程：添加下方微信，说明登录邮箱与需要的额度包，完成转账后余额会在核对后写入你的钱包。
        </p>
        {supportWechat ? (
          <p className="mt-4 font-mono text-sm">
            微信号：<span className="text-accent-readable">{supportWechat}</span>
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted">充值联系方式配置中，稍后再来。</p>
        )}
      </div>
    </RelayShell>
  );
}
