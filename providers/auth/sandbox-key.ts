import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getServerEnv, requireSandboxServiceSecret } from "@/config/env";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { SandboxKeyModel } from "@/providers/database/mongodb/models/sandbox-key";

export function hashSandboxKey(key: string) {
  return createHash("sha256").update(`zsk:${key}`).digest("hex");
}

export function generateSandboxKey() {
  const plaintext = `zsk_${randomBytes(24).toString("base64url")}`;
  return { plaintext, keyHash: hashSandboxKey(plaintext), prefix: plaintext.slice(0, 12) };
}

export type ResolvedSandboxKey = { id: string; userId: string; name: string };

export async function resolveSandboxKey(key: string): Promise<ResolvedSandboxKey | null> {
  if (!key.startsWith("zsk_")) return null;
  await connectMongo();
  const record = await SandboxKeyModel.findOneAndUpdate(
    { keyHash: hashSandboxKey(key), status: "active" },
    { $set: { lastUsedAt: new Date() } },
    { new: true },
  ).lean();
  return record ? { id: String(record._id), userId: String(record.userId), name: record.name } : null;
}

export function isSandboxServiceAuthorization(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7).trim());
  const secrets = [requireSandboxServiceSecret(), getServerEnv().RELAY_SANDBOX_SERVICE_SECRET_PREVIOUS].filter((value): value is string => Boolean(value));
  return secrets.some((secret) => {
    const expected = Buffer.from(secret);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });
}
