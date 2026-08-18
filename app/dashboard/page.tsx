import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@zmzai/theme";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { BalanceAccountModel } from "@/providers/database/mongodb/models/balance";
import { UsageModel } from "@/providers/database/mongodb/models/usage";
import { cnyMicrosLabel } from "@/providers/billing/currency";
import { ensureWelcomeCredit } from "@/providers/billing/onboarding";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
const money = (value: number) => cnyMicrosLabel(value);
export const dynamic = "force-dynamic";

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

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard")}`);
  await connectMongo();
  await ensureWelcomeCredit(user.id);
  const [account, usage] = await Promise.all([BalanceAccountModel.findOne({ userId: user.id }).lean(), UsageModel.find({ userId: user.id }).sort({ createdAt: -1 }).limit(8).lean()]);
  const charged = usage.reduce((sum, item) => sum + item.chargedMicros, 0);
  const success = usage.filter((item) => item.status === "completed").length;
  const availableMicros = Math.max(0, (account?.balanceMicros ?? 0) - (account?.reservedMicros ?? 0));
  const stats: Array<[string, string, string]> = [
    ["可用余额", money(availableMicros), "随每次调用扣减"],
    ["近期消费", money(charged), `最近 ${usage.length} 笔调用`],
    ["近期成功率", usage.length ? `${Math.round((success / usage.length) * 100)}%` : "-", `${success} / ${usage.length} 笔成功`],
  ];
  return (
    <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}>
      <h1 className="text-2xl font-semibold tracking-tight">概览</h1>
      <p className="mt-2 text-sm text-ink-2">余额、消费与最近调用。</p>

      {availableMicros === 0 ? (
        <p className="mt-5 rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          当前账户余额已用尽。
          <Link href="/dashboard/billing" className="ml-1 text-accent-readable underline underline-offset-4">去充值</Link>
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="rounded-lg border border-line bg-bg p-5">
            <p className="font-mono text-xs text-muted">{label}</p>
            <p className="mt-2 font-mono text-2xl font-medium">{value}</p>
            <p className="mt-1 text-xs text-muted">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-9">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">最近调用</h2>
          <Link href="/dashboard/activity" className="font-mono text-xs text-muted hover:text-accent-readable">全部记录 →</Link>
        </div>
        {usage.length ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
                  <th className="px-4 py-2.5 font-normal">模型</th>
                  <th className="px-4 py-2.5 font-normal">状态</th>
                  <th className="px-4 py-2.5 text-right font-normal">Tokens</th>
                  <th className="px-4 py-2.5 text-right font-normal">费用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {usage.map((item) => (
                  <tr key={String(item._id)}>
                    <td className="px-4 py-3 font-mono text-xs">{item.model}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(item.status)} size="sm">{statusLabel(item.status)}</Badge></td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted">{item.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{money(item.chargedMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-line px-4 py-6 text-sm text-muted">
            还没有调用记录。创建 <Link href="/dashboard/keys" className="text-accent-readable underline underline-offset-4">API Key</Link> 后即可开始调用。
          </p>
        )}
      </div>
    </RelayShell>
  );
}
