// src/app/api/admin/session/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || "");
  const expected = process.env.ADMIN_TOKEN || "";

  if (!expected) {
    return NextResponse.json({ error: "ADMIN_TOKEN not configured" }, { status: 500 });
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  // 7 days, httpOnly; secure in prod
  res.cookies.set("admin_ok", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  return res;
}
