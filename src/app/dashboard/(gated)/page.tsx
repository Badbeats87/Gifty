"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

type State =
  | { status: "loading" }
  | { status: "ready"; email: string | null }
  | { status: "error"; message: string };

export default function DashboardPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) throw error;

        if (!ignore) {
          setState({ status: "ready", email: user?.email ?? null });
        }
      } catch (e: any) {
        if (!ignore) {
          setState({
            status: "error",
            message: e?.message ?? "Failed to load dashboard.",
          });
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2">Loading…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-red-600">Error: {state.message}</p>
        <p className="mt-4">
          <Link href="/" className="underline">
            Go home
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2">
        Signed in as <span className="font-medium">{state.email ?? "unknown"}</span>
      </p>

      <ul className="mt-6 space-y-3">
        <li>
          <Link href="/dashboard/redeem" className="underline">
            Redeem a gift card
          </Link>
        </li>
        <li>
          <Link href="/dashboard/history" className="underline">
            Redemption history
          </Link>
        </li>
        <li>
          <Link href="/dashboard/business" className="underline">
            Business settings
          </Link>
        </li>
      </ul>
    </main>
  );
}
