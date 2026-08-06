import { type NextRequest, NextResponse } from "next/server";

import { AdminRequiredError, requireAdmin } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ApiKeyModel } from "@/providers/database/mongodb/models/apikey";

export const dynamic = "force-dynamic";

function err(code: string, status: number, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/** 吊销 key。 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminRequiredError) return err("ADMIN_REQUIRED", 403, "需要管理员权限");
    throw e;
  }
  const { id } = await params;
  await connectMongo();
  const r = await ApiKeyModel.updateOne({ _id: id }, { $set: { status: "revoked" } });
  if (r.matchedCount === 0) {
    return err("NOT_FOUND", 404, "key 不存在");
  }
  return NextResponse.json({ ok: true });
}
