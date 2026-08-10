import { model, models, Schema, type Model } from "mongoose";

export const reasoningEfforts = ["low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof reasoningEfforts)[number];

/** Public model registry. Keep this explicit so retired models cannot re-enter by accident. */
export const supportedModels = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "deepseek-v4-flash", "deepseek-v4-pro"] as const;
export type SupportedModel = (typeof supportedModels)[number];

export interface ModelPriceRecord {
  model: string;
  inputPricePer1kMicros: number;
  outputPricePer1kMicros: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  allowedReasoningEfforts: ReasoningEffort[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ModelPriceRecord>({
  model: { type: String, required: true, trim: true, unique: true, maxlength: 120, enum: supportedModels },
  inputPricePer1kMicros: { type: Number, required: true, min: 0 },
  outputPricePer1kMicros: { type: Number, required: true, min: 0 },
  maxInputTokens: { type: Number, required: true, min: 1, max: 2_000_000 },
  maxOutputTokens: { type: Number, required: true, min: 1, max: 500_000 },
  allowedReasoningEfforts: { type: [String], enum: reasoningEfforts, required: true, default: () => [...reasoningEfforts] },
  enabled: { type: Boolean, required: true, default: true },
}, { strict: "throw", timestamps: true });

export const ModelPriceModel =
  (models.ModelPrice as Model<ModelPriceRecord> | undefined) ?? model<ModelPriceRecord>("ModelPrice", schema);
