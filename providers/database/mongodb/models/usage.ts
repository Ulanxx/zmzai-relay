import {
  model,
  models,
  Schema,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export const usageStatuses = ["received", "streaming", "completed", "failed"] as const;
export type UsageStatus = (typeof usageStatuses)[number];

/** 每次调用留痕（审计 + 成本）。 */
export interface UsageRecord {
  requestId: string;
  userId: Types.ObjectId;         // muzhi 用户
  channelId: Types.ObjectId;      // 命中的渠道
  model: string;                  // 对外统一模型名
  upstreamModel: string;          // 上游实际模型名
  status: UsageStatus;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicros: number;
  latencyMs: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UsageDocument = HydratedDocument<UsageRecord>;

const usageSchema = new Schema<UsageRecord>(
  {
    requestId: { type: String, required: true, trim: true, maxlength: 128 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    channelId: { type: Schema.Types.ObjectId, ref: "Channel", required: true },
    model: { type: String, required: true, trim: true },
    upstreamModel: { type: String, required: true, trim: true },
    status: { type: String, enum: usageStatuses, required: true, default: "received" },
    promptTokens: { type: Number, required: true, default: 0, min: 0 },
    completionTokens: { type: Number, required: true, default: 0, min: 0 },
    totalTokens: { type: Number, required: true, default: 0, min: 0 },
    costMicros: { type: Number, required: true, default: 0, min: 0 },
    latencyMs: { type: Number, required: true, default: 0, min: 0 },
    lastError: { type: String, default: null },
  },
  { strict: "throw", timestamps: true },
);

usageSchema.index({ userId: 1, requestId: 1 }, { unique: true });
usageSchema.index({ createdAt: -1 });

export const UsageModel =
  (models.Usage as Model<UsageRecord> | undefined) ??
  model<UsageRecord>("Usage", usageSchema);
