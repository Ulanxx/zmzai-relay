import { redirect } from "next/navigation";

import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ensureWelcomeCredit } from "@/providers/billing/onboarding";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/billing")}`);
  await connectMongo();
  await ensureWelcomeCredit(user.id);
  const supportWechat = process.env.NEXT_PUBLIC_SUPPORT_WECHAT ?? "牧之微信号待配置";
  return <RelayShell role="user" userName={user.name} isAdminUser={user.role === "admin"}><p className="eyebrow">额度支持</p><h1 className="headline mt-2 text-4xl">先用 ¥1 体验额度</h1><p className="mt-3 max-w-2xl text-ink/70">每个账号首次进入会自动获得 ¥1 体验额度。余额用尽后，请联系牧之申请增加额度。</p><div className="mt-8 max-w-xl border border-line bg-surface p-6"><p className="eyebrow">余额用尽后</p><p className="mt-3 text-lg">联系「牧之」增加额度</p><p className="mt-4 font-mono text-xl text-accent-readable">微信号：{supportWechat}</p><p className="mt-4 text-sm leading-6 text-muted">请附上你的登录邮箱或用户昵称，以及需要增加的额度。人工确认后会直接写入你的个人钱包。</p></div></RelayShell>;
}
