import { redirect } from "next/navigation";
import { RelayShell } from "@/components/relay-shell";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ModelPriceModel, supportedModels } from "@/providers/database/mongodb/models/model-price";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.zmzai.cloud";
export const dynamic = "force-dynamic";
export default async function DocsPage() { const user = await getCurrentUser(); if (!user) redirect(`${AUTH_URL}/login?next=${encodeURIComponent("https://m.zmzai.cloud/dashboard/docs")}`); await connectMongo(); const models = await ModelPriceModel.find({ enabled: true, model: { $in: supportedModels } }).sort({ model: 1 }).lean(); return <RelayShell role="user" userName={user.name}><p className="eyebrow">调用文档</p><h1 className="headline mt-2 text-4xl">5.6 模型</h1><p className="mt-3 text-ink/70">模型名称与上游一致。推理强度使用 <code className="font-mono text-accent-readable">reasoning_effort</code> 传入。</p><div className="mt-8 divide-y divide-line border-y border-line">{models.map((model) => <div key={model.model} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-mono text-sm text-ink">{model.model}</p><p className="mt-1 text-sm text-muted">推理：{model.allowedReasoningEfforts.join(" · ")}</p></div><span className="font-mono text-xs text-muted">{model.maxInputTokens.toLocaleString()} in / {model.maxOutputTokens.toLocaleString()} out</span></div>)}</div><pre className="mt-8 overflow-x-auto border border-line bg-surface p-5 font-mono text-xs leading-6 text-ink/80">{`curl https://m.zmzai.cloud/api/v1/chat/completions \\
  -H "Authorization: Bearer zrk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.6-terra","reasoning_effort":"high","messages":[{"role":"user","content":"你好"}]}'`}</pre></RelayShell>; }
