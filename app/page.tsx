import Link from "next/link";
import { redirect } from "next/navigation";
import { Seal } from "@/components/seal";
import { Wordmark } from "@/components/wordmark";
import { PublicModelDirectory } from "@/components/public-model-directory";
import { getPublicModels } from "@/providers/catalog/public-models";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { getCurrentUser } from "@/providers/auth/session";

export const dynamic = "force-dynamic";
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/dashboard");
  await connectMongo();
  const models = await getPublicModels();
  return <main className="min-h-dvh bg-paper"><header className="page-shell flex items-center justify-between border-b-2 border-rule py-5"><Wordmark /><nav className="flex items-center gap-5 font-mono text-xs text-muted"><Link href="/models">模型目录</Link><Link href="/docs">API 文档</Link><Link href={`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard")}`} className="btn-primary">登录</Link></nav></header><section className="page-shell grid gap-10 py-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:items-end"><div><p className="eyebrow">zmzai cloud · M</p><h1 className="headline mt-3 text-5xl">先选模型，<br />再开始调用。</h1><p className="mt-6 max-w-md text-lg leading-8 text-ink/70">三个真实的 5.6 模型。一个兼容 OpenAI 的入口。价格、能力和调用方式先摆在这里。</p><div className="mt-7 flex flex-wrap gap-5 font-mono text-sm"><Link href="/models" className="btn-primary">浏览模型</Link><Link href="/docs" className="self-center text-accent-readable underline underline-offset-4">查看接入文档 →</Link></div></div><div><p className="eyebrow mb-3">公开模型目录 · {models.length} 个模型</p><PublicModelDirectory models={models} /></div></section><footer className="page-shell flex items-end justify-between gap-6 border-t-2 border-rule py-8"><div className="flex items-center gap-4"><Seal size={52} /><p className="font-mono text-xs text-muted">牧之署名 · zmzai cloud</p></div><Link href="https://zmzai.cloud" className="font-mono text-xs text-muted underline">产品矩阵 →</Link></footer></main>;
}
