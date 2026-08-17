import { ChannelModel } from "@/providers/database/mongodb/models/channel";
import { ModelPriceModel, supportedModels } from "@/providers/database/mongodb/models/model-price";
import { cnyMicrosLabel } from "@/providers/billing/currency";

export interface PublicModel {
  model: string;
  inputPricePer1kMicros: number;
  outputPricePer1kMicros: number;
  cacheReadPricePer1kMicros: number;
  cacheWritePricePer1kMicros: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  allowedReasoningEfforts: string[];
  routable: boolean;
}

export interface PublicChannelModel {
  model: string;
  inputPricePer1kMicros: number;
  outputPricePer1kMicros: number;
  cacheReadPricePer1kMicros: number;
  cacheWritePricePer1kMicros: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  allowedReasoningEfforts: string[];
  featured: boolean;
  featuredDescription: string;
}

export interface PublicChannel {
  channel: string;
  priority: number;
  models: PublicChannelModel[];
}

/** @deprecated Use `getPublicChannels()` instead — channel-first catalog. */
export async function getPublicModels(): Promise<PublicModel[]> {
  const [prices, channels] = await Promise.all([
    ModelPriceModel.find({ enabled: true, model: { $in: supportedModels } }).sort({ model: 1 }).lean(),
    ChannelModel.find({ enabled: true }).select("models").lean(),
  ]);
  const routable = new Set(channels.flatMap((channel) => channel.models.map((mapping) => mapping.public)));
  return prices.map((price) => ({
    model: price.model,
    inputPricePer1kMicros: price.inputPricePer1kMicros,
    outputPricePer1kMicros: price.outputPricePer1kMicros,
    cacheReadPricePer1kMicros: price.cacheReadPricePer1kMicros,
    cacheWritePricePer1kMicros: price.cacheWritePricePer1kMicros,
    maxInputTokens: price.maxInputTokens,
    maxOutputTokens: price.maxOutputTokens,
    allowedReasoningEfforts: price.allowedReasoningEfforts,
    routable: routable.has(price.model),
  }));
}

/** 渠道优先目录：以渠道为主键，每个渠道下列出可用模型（含价格）。 */
export async function getPublicChannels(): Promise<PublicChannel[]> {
  const [prices, channels] = await Promise.all([
    ModelPriceModel.find({ enabled: true, model: { $in: supportedModels } }).lean(),
    ChannelModel.find({ enabled: true }).sort({ priority: 1 }).lean(),
  ]);
  const priceMap = new Map(prices.map((p) => [p.model, p]));
  return channels.map((channel) => ({
    channel: channel.name,
    priority: channel.priority,
    models: channel.models
      .filter((mapping) => priceMap.has(mapping.public))
      .map((mapping) => {
        const p = priceMap.get(mapping.public)!;
        return {
          model: mapping.public,
          inputPricePer1kMicros: p.inputPricePer1kMicros,
          outputPricePer1kMicros: p.outputPricePer1kMicros,
          cacheReadPricePer1kMicros: p.cacheReadPricePer1kMicros,
          cacheWritePricePer1kMicros: p.cacheWritePricePer1kMicros,
          maxInputTokens: p.maxInputTokens,
          maxOutputTokens: p.maxOutputTokens,
          allowedReasoningEfforts: p.allowedReasoningEfforts,
          featured: p.featured,
          featuredDescription: p.featuredDescription,
        };
      }),
  })).filter((ch) => ch.models.length > 0);
}

export function moneyMicros(value: number): string {
  return cnyMicrosLabel(value);
}

/** ModelSelector 组件所需数据：推荐模型 + 渠道分组。 */
export interface PublicModelSelectorData {
  featured: { id: string; name: string; description: string; channel?: string }[];
  channels: { id: string; name: string; models: { id: string; name: string; channel?: string; meta?: Record<string, string> }[] }[];
}

export async function getPublicModelSelectorData(): Promise<PublicModelSelectorData> {
  const channels = await getPublicChannels();
  // 收集所有 featured 模型（去重，按 priority 排序取第一个渠道）
  const seen = new Set<string>();
  const featured: PublicModelSelectorData["featured"] = [];
  for (const ch of channels) {
    for (const m of ch.models) {
      if (m.featured && !seen.has(m.model)) {
        seen.add(m.model);
        featured.push({ id: m.model, name: m.model, description: m.featuredDescription, channel: ch.channel });
      }
    }
  }
  return {
    featured,
    channels: channels.map((ch) => ({
      id: ch.channel,
      name: ch.channel,
      models: ch.models.map((m) => ({
        id: m.model,
        name: m.model,
        channel: ch.channel,
        meta: {
          input: `${moneyMicros(m.inputPricePer1kMicros)} / 1k`,
          output: `${moneyMicros(m.outputPricePer1kMicros)} / 1k`,
        },
      })),
    })),
  };
}
