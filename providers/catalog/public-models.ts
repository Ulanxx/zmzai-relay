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
        };
      }),
  })).filter((ch) => ch.models.length > 0);
}

export function moneyMicros(value: number): string {
  return cnyMicrosLabel(value);
}
