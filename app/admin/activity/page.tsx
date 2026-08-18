import { redirect } from "next/navigation";
import { Badge } from "@zmzai/theme";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { BalanceLedgerModel } from "@/providers/database/mongodb/models/balance";
import { ChannelAttemptModel } from "@/providers/database/mongodb/models/channel-attempt";
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
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/admin/activity")}`);
  if (user.role !== "admin") redirect("/dashboard");
  await connectMongo();
  const [usages, ledger, uncertain] = await Promise.all([UsageModel.find().sort({ createdAt: -1 }).limit(80).lean(), BalanceLedgerModel.find().sort({ createdAt: -1 }).limit(80).lean(), ChannelAttemptModel.countDocuments({ costStatus: "unknown" })]);
  const attempts = await ChannelAttemptModel.find({ usageId: { $in: usages.map((item) => item._id) } }).sort({ createdAt: -1 }).lean();
  const attemptsByUsage = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const key = String(attempt.usageId);
    const current = attemptsByUsage.get(key) ?? [];
    current.push(attempt);
    attemptsByUsage.set(key, current);
  }
  return (
    <RelayShell role="admin" userName={user.name}>
      <h1 className="text-2xl font-semibold tracking-tight">调用与账本</h1>
      <p className="mt-2 text-sm text-ink-2">全站最近的调用、渠道尝试与余额流水。待核查上游成本：{uncertain} 笔。</p>
      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-start">
        <div>
          <h2 className="mb-3 text-lg font-semibold">调用</h2>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
                  <th className="px-4 py-2.5 font-normal">模型</th>
                  <th className="px-4 py-2.5 font-normal">状态</th>
                  <th className="px-4 py-2.5 text-right font-normal">Tokens</th>
                  <th className="px-4 py-2.5 text-right font-normal">费用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {usages.map((item) => {
                  const itemAttempts = attemptsByUsage.get(String(item._id)) ?? [];
                  return (
                    <tr key={String(item._id)} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs">{item.model}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted">{item.requestId} · → {item.upstreamModel}</p>
                        {item.lastError ? <p className="mt-0.5 text-[11px] text-danger">{item.lastError}</p> : null}
                        {itemAttempts.map((attempt) => (
                          <p key={String(attempt._id)} className="mt-0.5 font-mono text-[11px] text-muted">
                            渠道尝试 · {attempt.status} · {attempt.latencyMs}ms{attempt.error ? ` · ${attempt.error}` : ""}
                          </p>
                        ))}
                      </td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(item.status)} size="sm">{statusLabel(item.status)}</Badge></td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted">{item.totalTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{money(item.chargedMicros)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">账本</h2>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
                  <th className="px-4 py-2.5 font-normal">类型</th>
                  <th className="px-4 py-2.5 text-right font-normal">金额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ledger.map((item) => (
                  <tr key={String(item._id)}>
                    <td className="px-4 py-3">
                      <p className="text-xs">{kindLabel[item.kind] ?? item.kind}</p>
                      <p className="font-mono text-[11px] text-muted">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-xs ${item.amountMicros >= 0 ? "" : "text-danger"}`}>{money(item.amountMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </RelayShell>
  );
}
