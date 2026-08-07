import { NextResponse } from "next/server";

import { destroySession } from "@/providers/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
