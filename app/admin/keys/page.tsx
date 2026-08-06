import Link from "next/link";

import { Wordmark } from "@/components/wordmark";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ApiKeyModel } from "@/providers/database/mongodb/models/apikey";

import { KeyAdminPanel } from "./key-admin-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "API Key 管理 · 中转驿 admin" };

export default async function AdminKeysPage() {
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
  const keys = await ApiKeyModel.find().sort({ createdAt: -1 }).lean();
  const safe = keys.map((k) => ({
    _id: String(k._id),
    prefix: k.prefix,
    name: k.name,
    status: k.status,
    quotaTotalTokens: k.quotaTotalTokens,
    quotaUsedTokens: k.quotaUsedTokens,
    rateLimitPerMinute: k.rateLimitPerMinute,
    allowedModels: k.allowedModels,
  }));

  return (
    <main className="page-shell flex min-h-dvh flex-col py-10">
      <header className="flex items-center justify-between border-b-2 border-rule pb-5">
        <Wordmark />
        <nav className="flex items-center gap-5 font-mono text-xs text-muted">
          <Link href="/admin/channels" className="transition-colors hover:text-accent">渠道</Link>
          <Link href="/dashboard" className="transition-colors hover:text-accent">用量</Link>
          <span>m.zmzai.cloud · admin</span>
        </nav>
      </header>

      <section className="flex flex-1 flex-col gap-10 py-12">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">中转驿 · API Key 管理</p>
          <h1 className="headline text-4xl">分发 Key</h1>
          <p className="max-w-2xl text-ink/70">
            给调用方发独立 key，调用方用 <code className="font-mono text-accent-readable">Authorization: Bearer zrk_...</code> 调用，
            不用带 muzhi cookie。明文 key 只在创建时显示一次。
          </p>
        </div>

        <KeyAdminPanel initialKeys={safe} />
      </section>
    </main>
  );
}
