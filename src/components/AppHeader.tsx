// Server component: reads auth on the server and renders proper CTAs
import Link from "next/link";
import BackButton from "./BackButton";
import { supabaseServer } from "@/lib/supabase";

export default async function AppHeader() {
  // Try to read the current user from Supabase (cookie-based)
  let userId: string | null = null;
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) userId = data.user.id;
  } catch {
    // ignore – header should never crash the page
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Gifty"
            className="h-7 w-7 rounded-md border object-contain"
          />
          <strong className="text-lg">Gifty</strong>
        </Link>

        <nav className="ml-4 hidden items-center gap-4 text-sm sm:flex">
          <Link href="/" className="text-neutral-700 hover:text-black">
            Buy gifts
          </Link>

          {/* Businesses/Dashboard */}
          {userId ? (
            <Link
              href="/dashboard"
              className="text-neutral-700 hover:text-black"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/signup"
              className="text-neutral-700 hover:text-black"
            >
              For businesses
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <BackButton />

          {userId ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Dashboard
              </Link>
              {/* We’ll wire a true logout in Step 2 */}
              <Link
                href="/logout"
                className="rounded-lg bg-black px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                Log out
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-black px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
