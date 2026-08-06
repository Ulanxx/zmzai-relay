import { createHash } from "node:crypto";

import { cookies } from "next/headers";

import { getServerEnv, requireAuthSecret } from "@/config/env";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { SessionModel } from "@/providers/database/mongodb/models/session";
import {
  UserModel,
  type UserDocument,
  type UserRole,
  type UserStatus,
} from "@/providers/database/mongodb/models/user";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
}

function hashToken(token: string): string {
  const secret = requireAuthSecret();
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

function toAccount(user: UserDocument): CurrentUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
  };
}

/**
 * 读 muzhi 的 session cookie（跨子域 .zmzai.cloud 共享）→ 校验 → 返回用户。
 * 前提：muzhi 把 SESSION_COOKIE_NAME 的 cookie domain 设为 .zmzai.cloud，
 * 且本服务与 muzhi 同库、同 AUTH_SECRET。
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const env = getServerEnv();
  const token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  await connectMongo();
  const session = await SessionModel.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    return null;
  }

  const user = await UserModel.findById(session.userId);
  if (
    !user ||
    user.status !== "active" ||
    (!user.emailVerified && user.role !== "admin")
  ) {
    return null;
  }

  return toAccount(user);
}

export class AdminRequiredError extends Error {
  constructor() {
    super("ADMIN_REQUIRED");
    this.name = "AdminRequiredError";
  }
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new AdminRequiredError();
  }
  return user;
}
