import Link from "next/link";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/wordmark";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { UsageModel } from "@/providers/database/mongodb/models/usage";

export const dynamic = "force-dynamic";

export const metadata = { title: "我的用量 · 中转驿" };

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";

function fmtCost(micros: number): string {
  return `$${(micros / 1e6).toFixed(4)}`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    // 未登录 → 跳 SSO 认证中心，登录后跳回
    redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard")}`);
  }

  await connectMongo();
  const usages = await UsageModel.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const totalTokens = usages.reduce((s, u) => s + (u.totalTokens ?? 0), 0);
  const totalCost = usages.reduce((s, u) => s + (u.costMicros ?? 0), 0);

  return (
    <main className="page-shell flex min-h-dvh flex-col py-10">
      <header className="flex items-center justify-between border-b-2 border-rule pb-5">
        <Wordmark />
        <nav className="flex items-center gap-5 font-mono text-xs text-muted">
          {user.role === "admin" ? (
            <Link href="/admin/channels" className="transition-colors hover:text-accent">渠道配置</Link>
          ) : null}
          <span>{user.name}</span>
        </nav>
      </header>

      <section className="flex flex-1 flex-col gap-10 py-12">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">中转驿 · 我的用量</p>
          <h1 className="headline text-4xl">调用记录</h1>
          <p className="text-ink/70">
            你好 {user.name}。最近 {usages.length} 次调用共 {totalTokens.toLocaleString()} tokens，
            成本 {fmtCost(totalCost)}。
          </p>
        </div>

        <div className="border border-line bg-surface p-6">
          <h2 className="headline mb-4 text-xl">怎么调用</h2>
          <pre className="overflow-x-auto font-mono text-xs leading-6 text-ink/80">{`curl https://m.zmzai.cloud/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Cookie: muzhi_session=<你的登录 cookie>" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'`}</pre>
          <p className="mt-3 text-sm text-muted">
            v1 用 muzhi session 鉴权（登录 muzhi 即可调）。独立 API key 分发在 v2。
          </p>
        </div>

        {usages.length === 0 ? (
          <p className="text-sm text-muted">还没有调用记录。</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {usages.map((u) => (
              <li key={String(u._id)} className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-sm">
                <div className="flex items-baseline gap-3">
                  <span className={`font-mono text-[0.625rem] uppercase tracking-widest ${u.status === "completed" ? "text-success" : "text-red-700"}`}>
                    {u.status}
                  </span>
                  <span className="font-mono text-ink">{u.model}</span>
                  <span className="text-muted">→ {u.upstreamModel}</span>
                </div>
                <div className="flex items-baseline gap-4 font-mono text-xs text-muted">
                  <span>{(u.totalTokens ?? 0).toLocaleString()} tok</span>
                  <span>{fmtCost(u.costMicros ?? 0)}</span>
                  <span>{u.latencyMs}ms</span>
                  <span>{new Date(u.createdAt).toLocaleString("zh-CN")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
