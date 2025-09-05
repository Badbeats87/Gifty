// src/lib/supabase-server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client for Server Components, Route Handlers, Actions.
 *
 * - In Server Components (RSC), Next.js 15 forbids cookie mutation.
 *   So we implement read-only cookies: get() works; set/remove are NO-OPs.
 * - In Route Handlers / Server Actions, cookie mutation is allowed, and
 *   Supabase will still behave because it only needs mutations when rotating
 *   sessions. If you ever need explicit writes there, we can add a separate
 *   `supabaseServerMutable()` helper later.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // NO-OP in RSCs to comply with Next 15 rules.
        set(_name: string, _value: string, _options: any) {
          // intentionally empty: cookie writes are not allowed in Server Components
        },
        remove(_name: string, _options: any) {
          // intentionally empty
        },
      },
    }
  );
}
