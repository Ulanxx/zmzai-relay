import { model, models, Schema, type HydratedDocument, type Model, type Types } from "mongoose";

export interface SandboxKeyRecord {
  keyHash: string;
  prefix: string;
  name: string;
  userId: Types.ObjectId;
  status: "active" | "revoked";
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SandboxKeyDocument = HydratedDocument<SandboxKeyRecord>;

const sandboxKeySchema = new Schema<SandboxKeyRecord>(
  {
    keyHash: { type: String, required: true, select: false, unique: true },
    prefix: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["active", "revoked"], required: true, default: "active" },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { strict: "throw", timestamps: true },
);

sandboxKeySchema.index({ userId: 1, createdAt: -1 });

export const SandboxKeyModel =
  (models.SandboxKey as Model<SandboxKeyRecord> | undefined) ??
  model<SandboxKeyRecord>("SandboxKey", sandboxKeySchema);
