import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAgentServiceAuthorization } from "@/providers/auth/agent-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().min(1).max(128),
  taskRunId: z.string().min(1).max(128),
  requestId: z.string().min(1).max(128),
  model: z.string().min(1),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
  stream: z.boolean().default(true),
  max_tokens: z.number().int().positive().optional(),
}).strict();

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!isAgentServiceAuthorization(authorization)) return NextResponse.json({ code: "INTERNAL_SERVICE_UNAUTHORIZED", error: "未授权" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY", error: "请求体格式不正确" }, { status: 400 });

  const { userId, taskRunId, ...body } = parsed.data;
  const target = new URL("/api/v1/chat/completions", request.url);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authorization ?? "",
      "x-zmzai-agent-user-id": userId,
      "x-zmzai-agent-task-run-id": taskRunId,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
