import { ChannelModel } from "@/providers/database/mongodb/models/channel";
import { ModelPriceModel, supportedModels } from "@/providers/database/mongodb/models/model-price";
import { cnyMicrosLabel } from "@/providers/billing/currency";

export interface PublicModel {
  model: string;
  inputPricePer1kMicros: number;
  outputPricePer1kMicros: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  allowedReasoningEfforts: string[];
  routable: boolean;
}

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
    maxInputTokens: price.maxInputTokens,
    maxOutputTokens: price.maxOutputTokens,
    allowedReasoningEfforts: price.allowedReasoningEfforts,
    routable: routable.has(price.model),
  }));
}

export function moneyMicros(value: number): string {
  return cnyMicrosLabel(value);
}
