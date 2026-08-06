import { model, models, Schema, type Model } from "mongoose";

export const reasoningEfforts = ["low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = (typeof reasoningEfforts)[number];

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
  model: { type: String, required: true, trim: true, unique: true, maxlength: 120 },
  inputPricePer1kMicros: { type: Number, required: true, min: 0 },
  outputPricePer1kMicros: { type: Number, required: true, min: 0 },
  maxInputTokens: { type: Number, required: true, min: 1, max: 2_000_000 },
  maxOutputTokens: { type: Number, required: true, min: 1, max: 100_000 },
  allowedReasoningEfforts: { type: [String], enum: reasoningEfforts, required: true, default: () => [...reasoningEfforts] },
  enabled: { type: Boolean, required: true, default: true },
}, { strict: "throw", timestamps: true });

export const ModelPriceModel =
  (models.ModelPrice as Model<ModelPriceRecord> | undefined) ?? model<ModelPriceRecord>("ModelPrice", schema);
