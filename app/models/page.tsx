import Link from "next/link";
import { PublicModelDirectory } from "@/components/public-model-directory";
import { Wordmark } from "@/components/wordmark";
import { getPublicModels } from "@/providers/catalog/public-models";
import { connectMongo } from "@/providers/database/mongodb/connection";

export const dynamic = "force-dynamic";
export default async function ModelsPage() { await connectMongo(); const models = await getPublicModels(); return <main className="page-shell min-h-dvh py-8"><header className="flex items-center justify-between border-b-2 border-rule pb-5"><Link href="/"><Wordmark /></Link><nav className="flex gap-5 font-mono text-xs text-muted"><Link href="/docs">API 文档</Link><Link href="/dashboard">进入控制台 →</Link></nav></header><section className="py-14"><p className="eyebrow">模型目录 · 5.6</p><h1 className="headline mt-3 text-5xl">比较，再调用。</h1><p className="mt-4 max-w-xl text-lg text-ink/70">价格和能力来自当前开放目录。没有路由的模型会明确标为暂不可调用。</p><div className="mt-10"><PublicModelDirectory models={models} /></div></section></main>; }
