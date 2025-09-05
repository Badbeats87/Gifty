// src/lib/supabase-browser.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Client-side Supabase client.
 * Use ONLY in Client Components (files that start with "use client").
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
