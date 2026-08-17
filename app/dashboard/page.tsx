import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge, CardSpotlight, MovingBorder } from "@zmzai/theme";
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
  return (
    <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}>
      <p className="eyebrow">我的中转驿</p>
      <h1 className="headline mt-2 text-4xl">调用概览</h1>
      <p className="mt-3 text-ink/70">余额、Token 与每笔调用在同一处核对。</p>

      {availableMicros === 0 ? (
        <p className="mt-6 border-l-2 border-accent bg-surface px-4 py-3 text-sm text-ink/80">
          当前账户余额已用尽。
          <Link href="/dashboard/billing" className="ml-1 text-accent-readable underline">联系牧之增加额度</Link>
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <MovingBorder duration={6} backgroundColor="var(--color-surface)">
          <div className="p-5">
            <p className="eyebrow">可用余额</p>
            <p className="mt-2 font-mono text-3xl">{money(availableMicros)}</p>
            <p className="mt-1 text-xs text-muted">随每次调用扣减</p>
          </div>
        </MovingBorder>
        <CardSpotlight radius={220} color="rgba(196, 42, 36, 0.10)">
          <div className="p-5">
            <p className="eyebrow">近期消费</p>
            <p className="mt-2 font-mono text-3xl">{money(charged)}</p>
            <p className="mt-1 text-xs text-muted">最近 {usage.length} 笔调用</p>
          </div>
        </CardSpotlight>
        <CardSpotlight radius={220} color="rgba(196, 42, 36, 0.10)">
          <div className="p-5">
            <p className="eyebrow">近期成功率</p>
            <p className="mt-2 font-mono text-3xl">{usage.length ? `${Math.round((success / usage.length) * 100)}%` : "-"}</p>
            <p className="mt-1 text-xs text-muted">{success} / {usage.length} 笔成功</p>
          </div>
        </CardSpotlight>
      </div>

      <div className="mt-9">
        <h2 className="headline text-xl">最近调用</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {usage.map((item) => (
            <li key={String(item._id)} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <span className="font-mono">{item.model}</span>
              <span className="flex items-center gap-3">
                <Badge variant={statusVariant(item.status)} size="sm">{statusLabel(item.status)}</Badge>
                <span className="font-mono text-muted">{item.totalTokens.toLocaleString()} tok · {money(item.chargedMicros)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </RelayShell>
  );
}
