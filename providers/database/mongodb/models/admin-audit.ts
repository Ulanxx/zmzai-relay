import { model, models, Schema, type Model, type Types } from "mongoose";

export interface AdminAuditRecord { operatorUserId: Types.ObjectId; resourceType: string; resourceId: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null; createdAt: Date; updatedAt: Date; }
const schema = new Schema<AdminAuditRecord>({
  operatorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  resourceType: { type: String, required: true, maxlength: 80 },
  resourceId: { type: String, required: true, maxlength: 128 },
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  reason: { type: String, default: null, maxlength: 500 },
}, { strict: "throw", timestamps: true });
schema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
export const AdminAuditModel =
  (models.AdminAudit as Model<AdminAuditRecord> | undefined) ?? model<AdminAuditRecord>("AdminAudit", schema);
