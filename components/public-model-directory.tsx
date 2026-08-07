import Link from "next/link";
import type { PublicModel } from "@/providers/catalog/public-models";
import { moneyMicros } from "@/providers/catalog/public-models";

export function PublicModelDirectory({ models }: { models: PublicModel[] }) {
  return <div className="divide-y-2 divide-rule border-y-2 border-rule">{models.map((model) => <article key={model.model} className="grid gap-4 py-5 md:grid-cols-[minmax(12rem,1fr)_1.8fr_auto] md:items-center">
    <div><p className="font-mono text-lg">{model.model}</p><p className="mt-1 font-mono text-xs text-muted">{model.routable ? "可调用" : "暂不可调用"}</p></div>
    <div className="grid grid-cols-2 gap-4 font-mono text-xs text-muted sm:grid-cols-4"><span>入 {moneyMicros(model.inputPricePer1kMicros)} / 1k</span><span>出 {moneyMicros(model.outputPricePer1kMicros)} / 1k</span><span>上下文 {model.maxInputTokens.toLocaleString()}</span><span>推理 {model.allowedReasoningEfforts.join(" · ")}</span></div>
    <Link href={`/models/${encodeURIComponent(model.model)}`} className="font-mono text-xs text-accent-readable underline underline-offset-4">查看详情 →</Link>
  </article>)}</div>;
}
