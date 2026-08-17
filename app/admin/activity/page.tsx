import { redirect } from "next/navigation";
import { Badge, Icon } from "@zmzai/theme";
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
      <p className="eyebrow">调用与账本</p>
      <h1 className="headline mt-2 text-4xl">可追溯的运行记录</h1>
      <p className="mt-3 text-sm text-muted">待核查上游成本：{uncertain}</p>
      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <div>
          <h2 className="headline flex items-center gap-2 text-xl"><Icon name="activity" size={16} className="text-accent" />调用</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {usages.map((item) => {
              const itemAttempts = attemptsByUsage.get(String(item._id)) ?? [];
              return (
                <li key={String(item._id)} className="py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-mono">{item.model}</span>
                    <span className="font-mono text-muted">{money(item.chargedMicros)}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-2">
                    <Badge variant={statusVariant(item.status)} size="sm">{statusLabel(item.status)}</Badge>
                    <span className="font-mono text-xs text-muted">{item.requestId} · {item.upstreamModel} · {item.totalTokens} tok</span>
                  </p>
                  {item.lastError ? <p className="mt-1 text-xs text-accent-readable">{item.lastError}</p> : null}
                  {itemAttempts.map((attempt) => <p key={String(attempt._id)} className="mt-1 text-xs text-muted">渠道 {String(attempt.channelId)} · {attempt.status} · {attempt.latencyMs}ms{attempt.error ? ` · ${attempt.error}` : ""}</p>)}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h2 className="headline flex items-center gap-2 text-xl"><Icon name="receipt" size={16} className="text-accent" />账本</h2>
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
