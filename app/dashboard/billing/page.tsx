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

      <div className="mt-6 flex items-center justify-between gap-6 rounded-xl border border-line bg-bg p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">当前可用余额</p>
          <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-ink">{cnyMicrosLabel(availableMicros)}</p>
        </div>
        {account ? (
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted">总余额 / 已预留</p>
            <p className="mt-1 font-mono text-sm text-ink-2">
              {cnyMicrosLabel(account.balanceMicros ?? 0)} / {cnyMicrosLabel(account.reservedMicros ?? 0)}
            </p>
          </div>
        ) : null}
      </div>

      <h2 className="mt-10 text-lg font-semibold">额度包</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {products.map((product) => (
          <div
            key={product.id}
            className="flex flex-col rounded-xl border border-line bg-bg p-5 transition-all duration-200 hover:border-line-strong hover:shadow-md"
          >
            <p className="font-medium text-ink">{product.name}</p>
            <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
              <div>
                <p className="text-xs text-muted">到账额度</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-ink">{cnyMicrosLabel(product.creditMicros, 2)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">支付</p>
                <p className="mt-1 font-mono text-lg font-medium text-ink-2">{cnyFenLabel(product.paymentAmountFen)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">充值方式</h2>
      <div className="mt-4 rounded-xl border border-line bg-bg p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface">
            <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3M3.75 5.25h16.5a.75.75 0 01.75.75v12a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75V6a.75.75 0 01.75-.75z" />
            </svg>
          </div>
          <div>
            <p className="text-sm leading-6 text-ink-2">
              目前充值为人工核对流程：添加下方微信，说明登录邮箱与需要的额度包，完成转账后余额会在核对后写入你的钱包。
            </p>
            {supportWechat ? (
              <p className="mt-3 font-mono text-sm">
                微信号：<span className="text-accent-readable">{supportWechat}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">充值联系方式配置中，稍后再来。</p>
            )}
          </div>
        </div>
      </div>
    </RelayShell>
  );
}
