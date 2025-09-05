// src/lib/supabase.ts
// ⛔ Stop importing from this path.
// Use:
//   - "@/lib/supabase-server" in server code (Route Handlers, Server Components, Actions)
//   - "@/lib/supabase-browser" in client components ("use client")
//
// This shim keeps the build green but will throw if you actually CALL these functions,
// so we can see any remaining wrong imports at runtime.

export function supabaseServer() {
  throw new Error(
    "Import from '@/lib/supabase-server' instead of '@/lib/supabase'."
  );
}

export function supabaseBrowser() {
  throw new Error(
    "Import from '@/lib/supabase-browser' instead of '@/lib/supabase'."
  );
}
