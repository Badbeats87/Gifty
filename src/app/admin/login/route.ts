// src/app/admin/login/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/admin";

  const form = await req.formData();
  const token = String(form.get("token") || "");
  const expected = process.env.ADMIN_TOKEN || "";

  if (!expected) {
    const back = new URL("/admin/login?err=cfg", req.url);
    return NextResponse.redirect(back, 303);
  }
  if (token !== expected) {
    const back = new URL("/admin/login?err=bad", req.url);
    return NextResponse.redirect(back, 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set("admin_ok", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
