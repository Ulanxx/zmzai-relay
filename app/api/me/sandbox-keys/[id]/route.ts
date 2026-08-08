import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { SandboxKeyModel } from "@/providers/database/mongodb/models/sandbox-key";

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", error: "需要登录" }, { status: 401 });
  const { id } = await params;
  await connectMongo();
  const result = await SandboxKeyModel.updateOne({ _id: id, userId: user.id, status: "active" }, { $set: { status: "revoked", revokedAt: new Date() } });
  return result.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ code: "NOT_FOUND", error: "密钥不存在或已撤销" }, { status: 404 });
}
