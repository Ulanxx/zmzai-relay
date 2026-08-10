import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/config/env";

/**
 * 仅允许 a.zmzai.cloud 的服务端调用。此密钥不是用户 API Key，也不能用于 Sandbox。
 */
export function isAgentServiceAuthorization(authorization: string | null): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7).trim());
  const environment = getServerEnv();
  const secrets = [environment.RELAY_AGENT_SERVICE_SECRET_CURRENT, environment.RELAY_AGENT_SERVICE_SECRET_PREVIOUS].filter((value): value is string => Boolean(value));
  return secrets.some((secret) => {
    const expected = Buffer.from(secret);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });
}
