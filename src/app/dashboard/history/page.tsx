"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Redemption = {
  id: string;
  amount_cents: number | null;
  created_at: string | null;
  gift_card_id: string | null;
  code?: string | null; // optional if we can join gift_cards
};

type State =
  | { status: "loading" }
  | { status: "ready"; items: Redemption[] }
  | { status: "error"; message: string };

export default function HistoryPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const supabase = supabaseBrowser();

        // Ensure user is present (layout already gates, but keep it)
        const { error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        // Try to include the gift card code via relation if available:
        // This requires a FK and a PostgREST relationship from redemptions -> gift_cards.
        // If it errors, we fall back to the basic columns.
        let items: Redemption[] = [];
        let tryJoin = await supabase
          .from("redemptions")
          .select(
            `
            id,
            amount_cents,
            created_at,
            gift_card_id,
            gift_cards ( code )
          `
          )
          .order("created_at", { ascending: false });

        if (tryJoin.error) {
          // Fallback without the join
          const basic = await supabase
            .from("redemptions")
            .select("id, amount_cents, created_at, gift_card_id")
            .order("created_at", { ascending: false });

          if (basic.error) throw basic.error;

          items =
            (basic.data as any[]).map((r) => ({
              id: r.id,
              amount_cents: r.amount_cents ?? null,
              created_at: r.created_at ?? null,
              gift_card_id: r.gift_card_id ?? null,
              code: null,
            })) ?? [];
        } else {
          items =
            (tryJoin.data as any[]).map((r) => ({
              id: r.id,
              amount_cents: r.amount_cents ?? null,
              created_at: r.created_at ?? null,
              gift_card_id: r.gift_card_id ?? null,
              code: r.gift_cards?.code ?? null,
            })) ?? [];
        }

        if (!ignore) {
          setState({ status: "ready", items });
        }
      } catch (e: any) {
        if (!ignore) {
          setState({
            status: "error",
            message: e?.message ?? "Failed to load history.",
          });
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Redemption history</h1>

      {state.status === "loading" && <p className="mt-2">Loading…</p>}

      {state.status === "error" && (
        <>
          <p className="mt-2 text-red-600">Error: {state.message}</p>
          <p className="mt-4">
            <Link href="/dashboard" className="underline">
              Back to dashboard
            </Link>
          </p>
        </>
      )}

      {state.status === "ready" && (
        <>
          {state.items.length === 0 ? (
            <p className="mt-2 text-gray-600">No redemptions yet.</p>
          ) : (
            <ul className="mt-4 divide-y">
              {state.items.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {r.code ? (
                          <>
                            Code: <span className="tabular-nums">{r.code}</span>
                          </>
                        ) : (
                          <>
                            Gift Card:{" "}
                            <span className="tabular-nums">
                              {r.gift_card_id ?? "—"}
                            </span>
                          </>
                        )}
                      </p>
                      <p className="text-sm text-gray-600">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {(typeof r.amount_cents === "number"
                          ? r.amount_cents / 100
                          : 0
                        ).toLocaleString(undefined, {
                          style: "currency",
                          currency: "USD",
                        })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6">
            <Link href="/dashboard" className="underline">
              Back to dashboard
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
