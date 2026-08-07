import { redirect } from "next/navigation";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { BalanceAccountModel } from "@/providers/database/mongodb/models/balance";
import { ApiKeyModel } from "@/providers/database/mongodb/models/apikey";
import { UserModel } from "@zmzai/db";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
const money = (value: number) => `$${(value / 1e6).toFixed(4)}`;
export const dynamic = "force-dynamic";
export default async function UsersPage() { const user = await getCurrentUser(); if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/admin/users")}`); if (user.role !== "admin") redirect("/dashboard"); await connectMongo(); const [users, accounts, keys] = await Promise.all([UserModel.find().sort({ createdAt: -1 }).lean(), BalanceAccountModel.find().lean(), ApiKeyModel.find().lean()]); return <RelayShell role="admin" userName={user.name}><p className="eyebrow">用户与余额</p><h1 className="headline mt-2 text-4xl">账户总览</h1><ul className="mt-8 divide-y divide-line border-y border-line">{users.map((accountUser) => { const account = accounts.find((item) => String(item.userId) === String(accountUser._id)); const tokenCount = keys.filter((key) => String(key.userId) === String(accountUser._id) && key.status === "active").length; return <li key={String(accountUser._id)} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto_auto]"><div><p>{accountUser.name}</p><p className="font-mono text-xs text-muted">{accountUser.email}</p></div><span className="font-mono text-sm">{money((account?.balanceMicros ?? 0) - (account?.reservedMicros ?? 0))}</span><span className="font-mono text-xs text-muted">{tokenCount} active tokens</span></li>; })}</ul></RelayShell>; }
