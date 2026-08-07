import { model, models, Schema, type Model, type Types } from "mongoose";

import { paymentMethods, type PaymentMethod } from "./wallet-order";

export interface PaymentReconciliationRecord {
  orderId: Types.ObjectId;
  orderNo: string;
  userId: Types.ObjectId;
  paymentMethod: PaymentMethod;
  paidAmountFen: number;
  paidAt: Date;
  payerIdentifier: string | null;
  transactionNote: string | null;
  reviewerId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PaymentReconciliationRecord>({
  orderId: { type: Schema.Types.ObjectId, ref: "WalletOrder", required: true, unique: true },
  orderNo: { type: String, required: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  paymentMethod: { type: String, enum: paymentMethods, required: true },
  paidAmountFen: { type: Number, required: true, min: 1 },
  paidAt: { type: Date, required: true },
  payerIdentifier: { type: String, default: null, maxlength: 100 },
  transactionNote: { type: String, default: null, maxlength: 500 },
  reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { strict: "throw", timestamps: true });

export const PaymentReconciliationModel =
  (models.PaymentReconciliation as Model<PaymentReconciliationRecord> | undefined) ?? model<PaymentReconciliationRecord>("PaymentReconciliation", schema);
