import {
  model,
  models,
  Schema,
  type HydratedDocument,
  type Model,
} from "mongoose";

export const userRoles = ["user", "admin"] as const;
export type UserRole = (typeof userRoles)[number];
export const userStatuses = ["active", "suspended"] as const;
export type UserStatus = (typeof userStatuses)[number];

/** 镜像 muzhi 的 User 表（同 collection "users"），schema 必须一致。 */
export interface UserRecord {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserRecord>;

const userSchema = new Schema<UserRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: userRoles, required: true, default: "user" },
    status: { type: String, enum: userStatuses, required: true, default: "active" },
    emailVerified: { type: Boolean, required: true, default: false },
  },
  { strict: "throw", timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export const UserModel =
  (models.User as Model<UserRecord> | undefined) ??
  model<UserRecord>("User", userSchema);
