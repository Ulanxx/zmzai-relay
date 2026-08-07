import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { POST as chatCompletions } from "@/app/api/v1/chat/completions/route";

export const dynamic = "force-dynamic";

type InputItem = { role?: string; content?: unknown; type?: string; text?: string };

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object") {
      const item = part as { text?: unknown; content?: unknown };
      if (typeof item.text === "string") return item.text;
      if (typeof item.content === "string") return item.content;
    }
    return "";
  }).filter(Boolean).join("\n");
}

function toMessages(body: Record<string, unknown>) {
  const messages: Array<{ role: string; content: string }> = [];
  if (typeof body.instructions === "string" && body.instructions.trim()) messages.push({ role: "system", content: body.instructions });
  const input = body.input;
  if (typeof input === "string") messages.push({ role: "user", content: input });
  else if (Array.isArray(input)) {
    for (const item of input as InputItem[]) {
      if (item && typeof item === "object" && item.role) messages.push({ role: item.role, content: contentText(item.content ?? item.text) });
      else if (item && typeof item === "object" && item.type === "message") messages.push({ role: item.role ?? "user", content: contentText(item.content ?? item.text) });
    }
  }
  if (!messages.length && Array.isArray(body.messages)) return body.messages;
  return messages;
}

function responseEnvelope(model: string, chat: { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }) {
  const text = contentText(chat.choices?.[0]?.message?.content);
  const usage = chat.usage;
  return {
    id: `resp_${randomUUID().replaceAll("-", "")}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [{ id: `msg_${randomUUID().replaceAll("-", "")}`, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }],
    usage: usage ? { input_tokens: usage.prompt_tokens ?? 0, output_tokens: usage.completion_tokens ?? 0, total_tokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0) } : null,
  };
}

async function streamResponse(model: string, body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let raw = "";
  let fullText = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      emit("response.created", { type: "response.created", response: { id: `resp_${randomUUID().replaceAll("-", "")}`, object: "response", status: "in_progress", model } });
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          raw += decoder.decode(next.value, { stream: true });
          const lines = raw.split(/\r?\n/);
          raw = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown } }>; usage?: typeof usage };
              if (chunk.usage) usage = chunk.usage;
              const delta = contentText(chunk.choices?.[0]?.delta?.content);
              if (delta) { fullText += delta; emit("response.output_text.delta", { type: "response.output_text.delta", delta }); }
            } catch { /* Ignore non-JSON SSE lines from upstream. */ }
          }
        }
        emit("response.completed", { type: "response.completed", response: responseEnvelope(model, { choices: [{ message: { content: fullText } }], usage }) });
        controller.close();
      } catch (error) { controller.error(error); }
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.model !== "string") return NextResponse.json({ error: "请求体格式不正确", code: "INVALID_BODY" }, { status: 400 });
  const messages = toMessages(body);
  if (!messages.length) return NextResponse.json({ error: "input 不能为空", code: "INVALID_BODY" }, { status: 400 });
  const requestBody = {
    ...body,
    messages,
    max_tokens: body.max_output_tokens ?? body.max_completion_tokens ?? body.max_tokens,
    reasoning_effort: body.reasoning_effort ?? (body.reasoning && typeof body.reasoning === "object" ? (body.reasoning as { effort?: string }).effort : undefined),
    stream: body.stream === true,
  };
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  const internal = new Request(new URL("/api/v1/chat/completions", req.url), { method: "POST", headers, body: JSON.stringify(requestBody) });
  const chatResponse = await chatCompletions(new NextRequest(internal));
  if (!chatResponse.ok) return chatResponse;
  if (body.stream === true && chatResponse.body) return new NextResponse(await streamResponse(body.model, chatResponse.body), { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  const chat = await chatResponse.json().catch(() => null);
  return NextResponse.json(responseEnvelope(body.model, chat ?? {}));
}
