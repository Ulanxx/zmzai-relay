import { redirect } from "next/navigation";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { BalanceLedgerModel } from "@/providers/database/mongodb/models/balance";
import { ChannelAttemptModel } from "@/providers/database/mongodb/models/channel-attempt";
import { UsageModel } from "@/providers/database/mongodb/models/usage";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
const money = (value: number) => `$${(value / 1e6).toFixed(4)}`;
export const dynamic = "force-dynamic";
export default async function ActivityPage() { const user = await getCurrentUser(); if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/admin/activity")}`); if (user.role !== "admin") redirect("/dashboard"); await connectMongo(); const [usages, ledger, uncertain] = await Promise.all([UsageModel.find().sort({ createdAt: -1 }).limit(80).lean(), BalanceLedgerModel.find().sort({ createdAt: -1 }).limit(80).lean(), ChannelAttemptModel.countDocuments({ costStatus: "unknown" })]); return <RelayShell role="admin" userName={user.name}><p className="eyebrow">调用与账本</p><h1 className="headline mt-2 text-4xl">可追溯的运行记录</h1><p className="mt-3 text-sm text-muted">待核查上游成本：{uncertain}</p><div className="mt-8 grid gap-8 xl:grid-cols-2"><div><h2 className="headline text-xl">调用</h2><ul className="mt-3 divide-y divide-line border-y border-line">{usages.map((item) => <li key={String(item._id)} className="py-3 text-sm"><div className="flex justify-between gap-3"><span className="font-mono">{item.model}</span><span className="font-mono text-muted">{item.status} · {money(item.chargedMicros)}</span></div><p className="mt-1 font-mono text-xs text-muted">{item.requestId} · {item.upstreamModel} · {item.totalTokens} tok</p>{item.lastError ? <p className="mt-1 text-xs text-accent-readable">{item.lastError}</p> : null}</li>)}</ul></div><div><h2 className="headline text-xl">账本</h2><ul className="mt-3 divide-y divide-line border-y border-line">{ledger.map((item) => <li key={String(item._id)} className="flex justify-between gap-3 py-3 text-sm"><span>{item.kind}</span><span className="font-mono">{money(item.amountMicros)}</span></li>)}</ul></div></div></RelayShell>; }
