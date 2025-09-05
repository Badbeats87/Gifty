// src/lib/supabase-browser.ts
import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _browser: ReturnType<typeof createBrowserClient> | null = null;

/** Client-side singleton (no next/headers here) */
export function supabaseBrowser() {
  if (!_browser) {
    if (!url || !anon) throw new Error("Supabase env not configured");
    _browser = createBrowserClient(url, anon);
  }
  return _browser;
}
