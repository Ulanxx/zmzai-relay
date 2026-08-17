import {
  model,
  models,
  Schema,
  type HydratedDocument,
  type Model,
} from "mongoose";

export const channelProtocols = ["openai-compat"] as const;
export type ChannelProtocol = (typeof channelProtocols)[number];

/** 对外统一模型名 → 上游实际模型名 的一条映射。 */
export interface ModelMapping {
  public: string;    // 对外 "gpt-5.6-terra"
  upstream: string;  // 上游实际 "gpt-5.6-terra"
}

/** 上游中转站渠道（admin 配置）。 */
export interface ChannelRecord {
  name: string;               // 备注哪个站 "cheap-a"
  baseUrl: string;            // "https://api.cheap-a.com/v1"
  apiKey: string;             // 上游 key，select:false，不明文返回
  protocol: ChannelProtocol;
  models: ModelMapping[];
  priority: number;           // 小=优先（便宜的排前）
  inputCostPer1kTokensMicros: number | null;
  outputCostPer1kTokensMicros: number | null;
  cacheReadCostPer1kTokensMicros: number | null;
  cacheWriteCostPer1kTokensMicros: number | null;
  enabled: boolean;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ChannelDocument = HydratedDocument<ChannelRecord>;

const modelMappingSchema = new Schema<ModelMapping>(
  {
    public: { type: String, required: true, trim: true },
    upstream: { type: String, required: true, trim: true },
  },
  { _id: false, strict: "throw" },
);

const channelSchema = new Schema<ChannelRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    baseUrl: { type: String, required: true, trim: true, maxlength: 500 },
    apiKey: { type: String, required: true, select: false },
    protocol: {
      type: String,
      enum: channelProtocols,
      required: true,
      default: "openai-compat",
    },
    models: { type: [modelMappingSchema], required: true, default: [] },
    priority: { type: Number, required: true, default: 10 },
    inputCostPer1kTokensMicros: { type: Number, default: null, min: 0 },
    outputCostPer1kTokensMicros: { type: Number, default: null, min: 0 },
    cacheReadCostPer1kTokensMicros: { type: Number, default: null, min: 0 },
    cacheWriteCostPer1kTokensMicros: { type: Number, default: null, min: 0 },
    enabled: { type: Boolean, required: true, default: true },
    timeoutMs: { type: Number, required: true, default: 60000, min: 1000 },
  },
  { strict: "throw", timestamps: true },
);

export const ChannelModel =
  (models.Channel as Model<ChannelRecord> | undefined) ??
  model<ChannelRecord>("Channel", channelSchema);
