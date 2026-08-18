import { redirect } from "next/navigation";
import { Badge } from "@zmzai/theme";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { BalanceLedgerModel } from "@/providers/database/mongodb/models/balance";
import { UsageModel } from "@/providers/database/mongodb/models/usage";
import { cnyMicrosLabel } from "@/providers/billing/currency";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
const money = (value: number) => cnyMicrosLabel(value);
const statusVariant = (status: string): "success" | "danger" | "warning" | "outline" => {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "unsettled") return "warning";
  return "outline";
};
const statusLabel = (status: string): string => {
  if (status === "completed") return "成功";
  if (status === "failed") return "失败";
  if (status === "unsettled") return "待结算";
  return status;
};
const kindLabel: Record<string, string> = {
  welcome_credit: "新人体验额度",
  purchase_credit: "充值到账",
  admin_credit: "管理员加款",
  admin_debit: "管理员扣减",
  usage_charge: "调用扣费",
  refund: "退款",
};
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/activity")}`);
  await connectMongo();
  const [usages, ledger] = await Promise.all([UsageModel.find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).lean(), BalanceLedgerModel.find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).lean()]);
  return (
    <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}>
      <h1 className="text-2xl font-semibold tracking-tight">用量与账单</h1>
      <p className="mt-2 text-sm text-ink-2">最近 50 笔调用记录与余额变动。</p>
      <div className="mt-6 grid gap-8 xl:grid-cols-2 xl:items-start">
        <div>
          <h2 className="mb-3 text-lg font-semibold">调用记录</h2>
          {usages.length ? (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[26rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
                    <th className="px-4 py-2.5 font-normal">模型</th>
                    <th className="px-4 py-2.5 font-normal">状态</th>
                    <th className="px-4 py-2.5 text-right font-normal">Tokens</th>
                    <th className="px-4 py-2.5 text-right font-normal">费用</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {usages.map((usage) => (
                    <tr key={String(usage._id)} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs">{usage.model}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted">{new Date(usage.createdAt).toLocaleString("zh-CN")}</p>
                        {usage.lastError ? <p className="mt-0.5 text-[11px] text-danger">{usage.lastError}</p> : null}
                      </td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(usage.status)} size="sm">{statusLabel(usage.status)}</Badge></td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted">{usage.totalTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{money(usage.chargedMicros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-line px-4 py-6 text-sm text-muted">暂无调用记录。</p>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">余额账单</h2>
          {ledger.length ? (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
                    <th className="px-4 py-2.5 font-normal">类型</th>
                    <th className="px-4 py-2.5 font-normal">时间</th>
                    <th className="px-4 py-2.5 text-right font-normal">金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ledger.map((item) => (
                    <tr key={String(item._id)}>
                      <td className="px-4 py-3 text-xs">{kindLabel[item.kind] ?? item.kind}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${item.amountMicros >= 0 ? "" : "text-danger"}`}>{money(item.amountMicros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-line px-4 py-6 text-sm text-muted">暂无账单记录。</p>
          )}
        </div>
      </div>
    </RelayShell>
  );
}
