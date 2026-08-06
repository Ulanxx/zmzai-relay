import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/providers/auth/session";
import { connectMongo } from "@/providers/database/mongodb/connection";
import { ApiKeyModel } from "@/providers/database/mongodb/models/apikey";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) { const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "需要登录", code: "UNAUTHENTICATED" }, { status: 401 }); const { id } = await params; await connectMongo(); const result = await ApiKeyModel.updateOne({ _id: id, userId: user.id, status: "active" }, { $set: { status: "revoked" } }); return result.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Token 不存在", code: "NOT_FOUND" }, { status: 404 }); }
