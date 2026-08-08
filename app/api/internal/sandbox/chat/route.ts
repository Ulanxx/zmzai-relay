import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isSandboxServiceAuthorization } from "@/providers/auth/sandbox-key";

const bodySchema = z.object({ sandboxKey: z.string().min(1), model: z.string().min(1), messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1), stream: z.boolean().optional(), tools: z.array(z.unknown()).optional(), tool_choice: z.unknown().optional(), max_tokens: z.number().int().positive().optional(), requestId: z.string().max(128).optional() }).strict();

export async function POST(request: NextRequest) {
  if (!isSandboxServiceAuthorization(request.headers.get("authorization"))) return NextResponse.json({ code: "INTERNAL_SERVICE_UNAUTHORIZED", error: "未授权" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY", error: "请求体格式不正确" }, { status: 400 });
  const { sandboxKey, ...body } = parsed.data;
  const target = new URL("/api/v1/chat/completions", request.url);
  const response = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: request.headers.get("authorization") ?? "", "x-zmzai-sandbox-key": sandboxKey },
    body: JSON.stringify({ ...body, stream: false }),
    cache: "no-store",
  });
  return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
}
