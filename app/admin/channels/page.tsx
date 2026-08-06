import Link from "next/link";

import { Wordmark } from "@/components/wordmark";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ChannelModel } from "@/providers/database/mongodb/models/channel";

import { ChannelAdminPanel } from "./channel-admin-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "渠道配置 · 中转驿 admin" };

export default async function AdminChannelsPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    return (
      <main className="page-shell flex min-h-dvh flex-col items-center justify-center gap-6 py-10">
        <p className="text-lg text-ink/70">需要管理员权限</p>
        <Link href="https://muzhi.zmzai.cloud/login" className="btn-primary">
          去 muzhi 登录 →
        </Link>
      </main>
    );
  }

  await connectMongo();
  const channels = await ChannelModel.find().sort({ priority: 1 }).lean();
  const safe = channels.map((c) => ({
    _id: String(c._id),
    name: c.name,
    baseUrl: c.baseUrl,
    protocol: c.protocol,
    models: c.models,
    priority: c.priority,
    costPer1kTokensMicros: c.costPer1kTokensMicros,
    enabled: c.enabled,
    timeoutMs: c.timeoutMs,
  }));

  return (
    <main className="page-shell flex min-h-dvh flex-col py-10">
      <header className="flex items-center justify-between border-b-2 border-rule pb-5">
        <Wordmark />
        <nav className="flex items-center gap-5 font-mono text-xs text-muted">
          <Link href="/dashboard" className="transition-colors hover:text-accent">用量</Link>
          <span>m.zmzai.cloud · admin</span>
        </nav>
      </header>

      <section className="flex flex-1 flex-col gap-10 py-12">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">中转驿 · 渠道配置</p>
          <h1 className="headline text-4xl">上游渠道</h1>
          <p className="max-w-2xl text-ink/70">
            配置第三方便宜中转站。每个渠道 = 一个上游（base_url + key + 模型映射）。
            便宜的给低 priority 排前面，官方 API 做兜底。
          </p>
        </div>

        <ChannelAdminPanel initialChannels={safe} />
      </section>
    </main>
  );
}
