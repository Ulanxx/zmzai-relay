import { type NextRequest, NextResponse } from "next/server";

import { resolveApiKey } from "@/providers/auth/apikey";
import { getCurrentUser } from "@/providers/auth/session";
import { getInternalModelSelectorData, getPublicModels } from "@/providers/catalog/public-models";

export const dynamic = "force-dynamic";

type Caller = { allowedModels: string[] | null };

async function resolveCaller(request: NextRequest): Promise<Caller | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const key = await resolveApiKey(authorization.slice(7).trim());
    return key ? { allowedModels: key.allowedModels.length ? key.allowedModels : null } : null;
  }

  return (await getCurrentUser()) ? { allowedModels: null } : null;
}

export async function GET(request: NextRequest) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return NextResponse.json({ error: "需要有效的 API Token 或登录会话", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const [models, modelSelectorData] = await Promise.all([
    getPublicModels().then((all) =>
      all
        .filter((model) => model.routable)
        .filter((model) => !caller.allowedModels || caller.allowedModels.includes(model.model))
        .map(({ model, maxInputTokens, maxOutputTokens, allowedReasoningEfforts }) => ({ model, maxInputTokens, maxOutputTokens, allowedReasoningEfforts }))
    ),
    getInternalModelSelectorData(),
  ]);

  return NextResponse.json({ models, modelSelectorData });
}
