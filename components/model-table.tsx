import Link from "next/link";
import { Icon } from "@zmzai/theme";
import type { PublicChannel } from "@/providers/catalog/public-models";
import { moneyMicros } from "@/providers/catalog/public-models";

/**
 * 扁平模型表（OpenRouter 式）：一行一个模型，渠道作为行内属性。
 * 首页、/models 共用，保证全站只有一种模型展示语言。
 */
export function ModelTable({ channels }: { channels: PublicChannel[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-bg">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-left font-mono text-xs text-muted">
            <th className="px-4 py-2.5 font-normal">模型</th>
            <th className="px-4 py-2.5 font-normal">渠道</th>
            <th className="px-4 py-2.5 font-normal">上下文</th>
            <th className="px-4 py-2.5 text-right font-normal">输入 / 1K</th>
            <th className="px-4 py-2.5 text-right font-normal">输出 / 1K</th>
            <th className="px-4 py-2.5 text-right font-normal">缓存读 / 1K</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {channels.flatMap((channel) =>
            channel.models.map((model) => (
              <tr key={`${channel.channel}-${model.model}`} className="transition-colors hover:bg-surface">
                <td className="px-4 py-3">
                  <Link href={`/models/${encodeURIComponent(model.model)}`} className="inline-flex items-center gap-1.5 font-medium hover:text-accent-readable">
                    {model.model}
                    <Icon name="arrow-right" size={12} className="text-muted" />
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{channel.channel}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{model.maxInputTokens.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{moneyMicros(model.inputPricePer1kMicros)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{moneyMicros(model.outputPricePer1kMicros)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                  {model.cacheReadPricePer1kMicros > 0 ? moneyMicros(model.cacheReadPricePer1kMicros) : "—"}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
