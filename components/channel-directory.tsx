import Link from "next/link";
import { Badge, CardSpotlight, Icon } from "@zmzai/theme";
import type { PublicChannel } from "@/providers/catalog/public-models";
import { moneyMicros } from "@/providers/catalog/public-models";

export function ChannelDirectory({ channels }: { channels: PublicChannel[] }) {
  return (
    <div className="flex flex-col gap-8">
      {channels.map((channel) => (
        <section key={channel.channel}>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="headline text-xl">{channel.channel}</h2>
            <span className="font-mono text-xs text-muted">P{channel.priority}</span>
            <Badge variant="outline" size="sm">{channel.models.length} 个模型</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {channel.models.map((model) => (
              <CardSpotlight key={`${channel.channel}-${model.model}`} radius={260} color="rgba(196, 42, 36, 0.10)">
                <div className="flex h-full flex-col p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 font-mono text-lg"><Icon name="bolt" size={15} className="text-accent" />{model.model}</p>
                    <Badge variant="success" size="sm">可调用</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs text-muted sm:grid-cols-4">
                    <span>入 {moneyMicros(model.inputPricePer1kMicros)} / 1k</span>
                    <span>出 {moneyMicros(model.outputPricePer1kMicros)} / 1k</span>
                    {model.cacheReadPricePer1kMicros > 0 ? <span>缓存读 {moneyMicros(model.cacheReadPricePer1kMicros)} / 1k</span> : null}
                    {model.cacheWritePricePer1kMicros > 0 ? <span>缓存写 {moneyMicros(model.cacheWritePricePer1kMicros)} / 1k</span> : null}
                    <span>上下文 {model.maxInputTokens.toLocaleString()}</span>
                    <span>推理 {model.allowedReasoningEfforts.join(" · ")}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <Link href={`/models/${encodeURIComponent(model.model)}`} className="flex items-center gap-1 font-mono text-xs text-accent-readable underline underline-offset-4">查看详情<Icon name="arrow-right" size={12} /></Link>
                    <span className="font-mono text-[10px] text-muted">channel: {channel.channel}</span>
                  </div>
                  <div className="mt-3 rounded bg-surface px-3 py-2 font-mono text-[10px] text-muted">
                    <span className="text-ink/50">curl ... -d &#123;</span><span className="text-accent-readable">&quot;channel&quot;:&quot;{channel.channel}&quot;</span><span className="text-ink/50">, &quot;model&quot;:&quot;{model.model}&quot;, ...&#125;</span>
                  </div>
                </div>
              </CardSpotlight>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
