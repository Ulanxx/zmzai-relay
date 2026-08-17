import { redirect } from "next/navigation";
import { Badge, Icon } from "@zmzai/theme";
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
export const dynamic = "force-dynamic";
export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/activity")}`);
  await connectMongo();
  const [usages, ledger] = await Promise.all([UsageModel.find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).lean(), BalanceLedgerModel.find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).lean()]);
  return (
    <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}>
      <p className="eyebrow">用量与账单</p>
      <h1 className="headline mt-2 text-4xl">每一次调用都有账</h1>
      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <div>
          <h2 className="headline flex items-center gap-2 text-xl"><Icon name="activity" size={16} className="text-accent" />调用</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {usages.map((usage) => (
              <li key={String(usage._id)} className="py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-mono">{usage.model}</span>
                  <span className="font-mono text-muted">{usage.totalTokens.toLocaleString()} tok · {money(usage.chargedMicros)}</span>
                </div>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <Badge variant={statusVariant(usage.status)} size="sm">{statusLabel(usage.status)}</Badge>
                  {new Date(usage.createdAt).toLocaleString("zh-CN")}
                </p>
                {usage.lastError ? <p className="mt-1 text-xs text-accent-readable">{usage.lastError}</p> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="headline flex items-center gap-2 text-xl"><Icon name="receipt" size={16} className="text-accent" />账单</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {ledger.map((item) => (
              <li key={String(item._id)} className="flex justify-between gap-3 py-3 text-sm">
                <span>{item.kind}</span>
                <span className="font-mono">{money(item.amountMicros)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </RelayShell>
  );
}
