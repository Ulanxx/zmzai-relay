import Link from "next/link";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/wordmark";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";
import { UsageModel } from "@/providers/database/mongodb/models/usage";

import { OperationsPanel } from "./operations-panel";

export const dynamic = "force-dynamic";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
function money(value: number) { return `$${(value / 1e6).toFixed(2)}`; }
export default async function AdminPage() {
  const user = await getCurrentUser(); if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/admin")}`); if (user.role !== "admin") redirect("/dashboard");
  await connectMongo(); const since = new Date(Date.now() - 24 * 60 * 60 * 1000); const [usage, channels] = await Promise.all([UsageModel.aggregate([{ $match: { createdAt: { $gte: since }, status: "completed" } }, { $group: { _id: null, requests: { $sum: 1 }, charged: { $sum: "$chargedMicros" }, cost: { $sum: "$costMicros" } } }]), ChannelModel.find().lean()]); const today = usage[0] ?? { requests: 0, charged: 0, cost: 0 };
  return <main className="page-shell flex min-h-dvh flex-col py-10"><header className="flex items-center justify-between border-b-2 border-rule pb-5"><Wordmark /><nav className="flex gap-4 font-mono text-xs text-muted"><Link href="/admin/channels">渠道</Link><Link href="/admin/keys">Token</Link><Link href="/dashboard">用户端</Link></nav></header><section className="flex flex-1 flex-col gap-9 py-10"><div><p className="eyebrow">中转驿 · 管理运营</p><h1 className="headline mt-2 text-4xl">今日帐</h1></div><div className="grid gap-px border border-line bg-line sm:grid-cols-4">{[["请求", today.requests.toLocaleString()], ["收入", money(today.charged)], ["渠道成本", money(today.cost)], ["毛利", money(today.charged - today.cost)]].map(([label, value]) => <div key={label} className="bg-surface p-4"><p className="eyebrow">{label}</p><p className="mt-1 font-mono text-xl text-ink">{value}</p></div>)}</div><p className="font-mono text-xs text-muted">渠道：{channels.filter((channel) => channel.enabled).length} 启用 / {channels.length} 配置</p><OperationsPanel /></section></main>;
}
