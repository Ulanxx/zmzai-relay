import { model, models, Schema, type Model, type Types } from "mongoose";

export interface BalanceReservationRecord {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId | null;
  usageId: Types.ObjectId;
  amountMicros: number;
  status: "held" | "settled" | "released";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<BalanceReservationRecord>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  apiKeyId: { type: Schema.Types.ObjectId, ref: "ApiKey", default: null },
  usageId: { type: Schema.Types.ObjectId, ref: "Usage", required: true, unique: true },
  amountMicros: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["held", "settled", "released"], required: true, default: "held" },
  expiresAt: { type: Date, required: true, index: true },
}, { strict: "throw", timestamps: true });

export const BalanceReservationModel =
  (models.BalanceReservation as Model<BalanceReservationRecord> | undefined) ?? model<BalanceReservationRecord>("BalanceReservation", schema);
