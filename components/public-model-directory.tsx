import Link from "next/link";
import { Badge, CardSpotlight, Icon } from "@zmzai/theme";
import type { PublicModel } from "@/providers/catalog/public-models";
import { moneyMicros } from "@/providers/catalog/public-models";

export function PublicModelDirectory({ models }: { models: PublicModel[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {models.map((model) => (
        <CardSpotlight key={model.model} radius={260} color="rgba(196, 42, 36, 0.10)">
          <div className="flex h-full flex-col p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-mono text-lg"><Icon name="bolt" size={15} className="text-accent" />{model.model}</p>
              <Badge variant={model.routable ? "success" : "outline"} size="sm">{model.routable ? "可调用" : "暂不可调用"}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs text-muted sm:grid-cols-4">
              <span>入 {moneyMicros(model.inputPricePer1kMicros)} / 1k</span>
              <span>出 {moneyMicros(model.outputPricePer1kMicros)} / 1k</span>
              <span>上下文 {model.maxInputTokens.toLocaleString()}</span>
              <span>推理 {model.allowedReasoningEfforts.join(" · ")}</span>
            </div>
            <Link href={`/models/${encodeURIComponent(model.model)}`} className="mt-4 flex items-center gap-1 font-mono text-xs text-accent-readable underline underline-offset-4">查看详情<Icon name="arrow-right" size={12} /></Link>
          </div>
        </CardSpotlight>
      ))}
    </div>
  );
}
