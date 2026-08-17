import Link from "next/link";
import { ChannelDirectory } from "@/components/channel-directory";
import { Wordmark } from "@/components/wordmark";
import { getPublicChannels } from "@/providers/catalog/public-models";
import { connectMongo } from "@/providers/database/mongodb/connection";

export const dynamic = "force-dynamic";
export default async function ModelsPage() { await connectMongo(); const channels = await getPublicChannels(); return <main className="page-shell min-h-dvh py-8"><header className="flex items-center justify-between border-b-2 border-rule pb-5"><Link href="/"><Wordmark /></Link><nav className="flex gap-5 font-mono text-xs text-muted"><Link href="/docs">API 文档</Link><Link href="/dashboard">进入控制台 →</Link></nav></header><section className="py-14"><p className="eyebrow">渠道目录</p><h1 className="headline mt-3 text-5xl">先选渠道，再选模型。</h1><p className="mt-4 max-w-xl text-lg text-ink/70">渠道决定上游路径和成本。价格、缓存折扣和调用方式都在这里。</p><div className="mt-10"><ChannelDirectory channels={channels} /></div></section></main>; }
