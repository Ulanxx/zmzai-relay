import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { UserModel } from "@zmzai/db";

import { isAgentServiceAuthorization } from "@/providers/auth/agent-service";
import { getInternalModelSelectorData } from "@/providers/catalog/public-models";
import { connectMongo } from "@/providers/database/mongodb/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ userId: z.string().min(1).max(128) }).strict();

export async function POST(request: NextRequest) {
  if (!isAgentServiceAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ code: "INTERNAL_SERVICE_UNAUTHORIZED", error: "未授权" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BODY", error: "请求体格式不正确" }, { status: 400 });

  await connectMongo();
  const user = await UserModel.findById(parsed.data.userId).lean();
  if (!user || user.status !== "active" || (!user.emailVerified && user.role !== "admin")) {
    return NextResponse.json({ code: "UNAUTHENTICATED", error: "用户不可用" }, { status: 401 });
  }

  const data = await getInternalModelSelectorData();
  return NextResponse.json({ modelSelectorData: data }, { headers: { "cache-control": "no-store" } });
}
