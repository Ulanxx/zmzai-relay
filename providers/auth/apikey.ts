import { createHash, randomBytes } from "node:crypto";

import { connectMongo } from "@/providers/database/mongodb/connection";
import {
  ApiKeyModel,
  type ApiKeyRecord,
} from "@/providers/database/mongodb/models/apikey";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(`zrk:${key}`).digest("hex");
}

/** 生成新 key：返回明文（仅此一次）+ 可存库的记录字段。 */
export function generateApiKey(): { plaintext: string; keyHash: string; prefix: string } {
  const plaintext = `zrk_${randomBytes(24).toString("base64url")}`;
  return {
    plaintext,
    keyHash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 12),
  };
}

export interface ResolvedApiKey {
  id: string;
  name: string;
  allowedModels: string[];
  quotaTotalTokens: number;
  quotaUsedTokens: number;
}

/** 校验 Bearer key，返回 key 信息（有效且未超额度）或 null。 */
export async function resolveApiKey(key: string): Promise<ResolvedApiKey | null> {
  if (!key.startsWith("zrk_")) {
    return null;
  }
  await connectMongo();
  const doc = await ApiKeyModel.findOne({
    keyHash: hashApiKey(key),
    status: "active",
  })
    .select("+keyHash")
    .lean();
  if (!doc) {
    return null;
  }
  if (doc.quotaTotalTokens > 0 && doc.quotaUsedTokens >= doc.quotaTotalTokens) {
    return null; // 额度用完
  }
  return {
    id: String(doc._id),
    name: doc.name,
    allowedModels: doc.allowedModels,
    quotaTotalTokens: doc.quotaTotalTokens,
    quotaUsedTokens: doc.quotaUsedTokens,
  };
}

/** 累加 key 用量（原子）。 */
export async function addApiKeyUsage(id: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  try {
    await ApiKeyModel.updateOne(
      { _id: id },
      { $inc: { quotaUsedTokens: tokens } },
    );
  } catch {
    console.error("addApiKeyUsage failed", id);
  }
}
