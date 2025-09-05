// src/app/api/auth/cookie/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const session = body?.session;
  if (!session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !anon) {
    return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
  }

  const cookieStore = cookies();
  const res = NextResponse.json({ ok: true });

  const supabase = createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        res.cookies.set(name, value, options);
      },
      remove(name: string, options: any) {
        res.cookies.set(name, "", { ...options, maxAge: 0 });
      },
    },
  });

  // This writes the auth cookies to the response via the cookie adapter above
  await supabase.auth.setSession(session);
  return res;
}
