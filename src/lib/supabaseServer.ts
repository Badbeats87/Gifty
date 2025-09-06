// src/lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Server-side Supabase client for read-only admin views.
 * Uses the anon key; make sure RLS policies allow the reads you need.
 * If you later require privileged reads, swap to service role (server only).
 */
export function getSupabaseServer() {
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { fetch }, // use Next.js fetch
  });
}
