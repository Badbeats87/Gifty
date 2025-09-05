// src/lib/supabase-server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server-side helper (reads cookies; writes happen in API routes) */
export async function supabaseServer() {
  if (!url || !anon) throw new Error("Supabase env not configured");
  const store = await cookies(); // Next 15: must await once

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return store.get(name)?.value;
      },
      // SSG/Server Components can’t set headers here; writes are done in /api/auth/cookie
      set() {},
      remove() {},
    },
  });
}
