import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isSandboxServiceAuthorization, resolveSandboxKey } from "@/providers/auth/sandbox-key";
import { getInternalModelSelectorData } from "@/providers/catalog/public-models";

const bodySchema = z.object({ sandboxKey: z.string().min(1) }).strict();

export async function POST(request: NextRequest) {
  if (!isSandboxServiceAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ code: "INTERNAL_SERVICE_UNAUTHORIZED", error: "未授权" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY", error: "请求体格式不正确" }, { status: 400 });

  if (!(await resolveSandboxKey(parsed.data.sandboxKey))) {
    return NextResponse.json({ code: "SANDBOX_KEY_INVALID", error: "Sandbox key 无效或已撤销" }, { status: 401 });
  }

  const data = await getInternalModelSelectorData();
  return NextResponse.json({ modelSelectorData: data }, { headers: { "Cache-Control": "no-store" } });
}
