import { model, models, Schema, type Model, type Types } from "mongoose";

export interface ChannelAttemptRecord {
  usageId: Types.ObjectId;
  channelId: Types.ObjectId;
  upstreamModel: string;
  status: "completed" | "failed";
  latencyMs: number;
  error: string | null;
  costStatus: "known" | "unknown" | "not_charged";
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ChannelAttemptRecord>({
  usageId: { type: Schema.Types.ObjectId, ref: "Usage", required: true, index: true },
  channelId: { type: Schema.Types.ObjectId, ref: "Channel", required: true },
  upstreamModel: { type: String, required: true, trim: true },
  status: { type: String, enum: ["completed", "failed"], required: true },
  latencyMs: { type: Number, required: true, min: 0 },
  error: { type: String, default: null, maxlength: 500 },
  costStatus: { type: String, enum: ["known", "unknown", "not_charged"], required: true },
}, { strict: "throw", timestamps: true });

export const ChannelAttemptModel =
  (models.ChannelAttempt as Model<ChannelAttemptRecord> | undefined) ?? model<ChannelAttemptRecord>("ChannelAttempt", schema);
