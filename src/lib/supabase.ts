// src/lib/supabase.ts
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _browser: ReturnType<typeof createBrowserClient> | null = null;

/** Client-side singleton */
export function supabaseBrowser() {
  if (!_browser) {
    if (!url || !anon) throw new Error("Supabase env not configured");
    _browser = createBrowserClient(url, anon);
  }
  return _browser;
}

/** Server-side helper (reads cookies; does not write) */
export async function supabaseServer() {
  if (!url || !anon) throw new Error("Supabase env not configured");
  const store = await cookies(); // ✅ Next 15: await once

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return store.get(name)?.value;
      },
      // Server Components can’t set headers directly; writes are handled in API routes like /api/auth/cookie.
      set() {/* no-op */},
      remove() {/* no-op */},
    },
  });
}
