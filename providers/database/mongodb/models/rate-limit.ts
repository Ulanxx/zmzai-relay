import { model, models, Schema, type Model } from "mongoose";

export interface RateLimitBucketRecord { keyId: string; windowStart: Date; count: number; createdAt: Date; updatedAt: Date; }
const schema = new Schema<RateLimitBucketRecord>({
  keyId: { type: String, required: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, required: true, default: 0 },
}, { strict: "throw", timestamps: true, collection: "relayratelimitbuckets" });
schema.index({ keyId: 1, windowStart: 1 }, { unique: true });
schema.index({ windowStart: 1 }, { expireAfterSeconds: 7200 });
export const RateLimitBucketModel =
  (models.RateLimitBucket as Model<RateLimitBucketRecord> | undefined) ?? model<RateLimitBucketRecord>("RateLimitBucket", schema);
