import { redirect } from "next/navigation";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ApiKeyModel } from "@/providers/database/mongodb/models/apikey";
import { ModelPriceModel } from "@/providers/database/mongodb/models/model-price";
import { TokenPanel } from "../token-panel";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";
export default async function KeysPage() { const user = await getCurrentUser(); if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/keys")}`); await connectMongo(); const [keys, models] = await Promise.all([ApiKeyModel.find({ userId: user.id }).sort({ createdAt: -1 }).lean(), ModelPriceModel.find({ enabled: true }).sort({ model: 1 }).lean()]); return <RelayShell role="user" userName={user.name}><p className="eyebrow">我的 Token</p><h1 className="headline mt-2 text-4xl">可撤销的访问凭据</h1><div className="mt-8"><TokenPanel initialKeys={keys.map((key) => ({ _id: String(key._id), prefix: key.prefix, name: key.name, status: key.status, rateLimitPerMinute: key.rateLimitPerMinute, monthlySpendLimitMicros: key.monthlySpendLimitMicros, monthlySpendUsedMicros: key.monthlySpendUsedMicros, lastUsedAt: key.lastUsedAt?.toISOString() ?? null }))} models={models.map((model) => model.model)} /></div></RelayShell>; }
