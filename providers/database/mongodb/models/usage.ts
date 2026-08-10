import {
  model,
  models,
  Schema,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export const usageStatuses = ["received", "streaming", "processing", "completed", "failed", "unsettled"] as const;
export type UsageStatus = (typeof usageStatuses)[number];

/** 每次调用留痕（审计 + 成本）。 */
export interface UsageRecord {
  requestId: string;
  userId: Types.ObjectId;         // muzhi 用户
  apiKeyId: Types.ObjectId | null;
  callerKind: "apikey" | "session" | "sandbox_key" | "agent_service";
  callerId: string;
  taskRunId: string | null;
  sandboxKeyId: Types.ObjectId | null;
  channelId: Types.ObjectId | null; // 命中的渠道
  model: string;                  // 对外统一模型名
  upstreamModel: string;          // 上游实际模型名
  status: UsageStatus;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicros: number;
  chargedMicros: number;
  grossProfitMicros: number;
  inputPricePer1kMicros: number;
  outputPricePer1kMicros: number;
  inputCostPer1kTokensMicros: number;
  outputCostPer1kTokensMicros: number;
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
    apiKeyId: { type: Schema.Types.ObjectId, ref: "ApiKey", default: null, index: true },
    callerKind: { type: String, enum: ["apikey", "session", "sandbox_key", "agent_service"], required: true, default: "session" },
    callerId: { type: String, required: true, index: true },
    taskRunId: { type: String, default: null, index: true },
    sandboxKeyId: { type: Schema.Types.ObjectId, ref: "SandboxKey", default: null, index: true },
    channelId: { type: Schema.Types.ObjectId, ref: "Channel", default: null },
    model: { type: String, required: true, trim: true },
    upstreamModel: { type: String, required: true, trim: true },
    status: { type: String, enum: usageStatuses, required: true, default: "received" },
    promptTokens: { type: Number, required: true, default: 0, min: 0 },
    completionTokens: { type: Number, required: true, default: 0, min: 0 },
    totalTokens: { type: Number, required: true, default: 0, min: 0 },
    costMicros: { type: Number, required: true, default: 0, min: 0 },
    chargedMicros: { type: Number, required: true, default: 0, min: 0 },
    grossProfitMicros: { type: Number, required: true, default: 0 },
    inputPricePer1kMicros: { type: Number, required: true, default: 0, min: 0 },
    outputPricePer1kMicros: { type: Number, required: true, default: 0, min: 0 },
    inputCostPer1kTokensMicros: { type: Number, required: true, default: 0, min: 0 },
    outputCostPer1kTokensMicros: { type: Number, required: true, default: 0, min: 0 },
    latencyMs: { type: Number, required: true, default: 0, min: 0 },
    lastError: { type: String, default: null },
  },
  { strict: "throw", timestamps: true },
);

usageSchema.index({ callerKind: 1, callerId: 1, requestId: 1 }, { unique: true });
usageSchema.index({ createdAt: -1 });

export const UsageModel =
  (models.Usage as Model<UsageRecord> | undefined) ??
  model<UsageRecord>("Usage", usageSchema);
