"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type State =
  | { status: "loading" }
  | {
      status: "ready";
      code: string;
      amount_cents: number;
      buyerEmail: string | null;
      recipientEmail: string | null;
    }
  | { status: "error"; message: string };

export default function SuccessPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const session_id = params.get("session_id");

        if (!session_id) {
          throw new Error("Missing session_id in URL.");
        }

        // Call our fulfill endpoint to issue the code and return details
        const res = await fetch("/api/checkout/fulfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || `Fulfillment failed with ${res.status}`);
        }

        if (!ignore) {
          setState({
            status: "ready",
            code: String(data.code),
            amount_cents: Number(data.amount_cents ?? 0),
            buyerEmail: data.buyerEmail ?? null,
            recipientEmail: data.recipientEmail ?? null,
          });
        }
      } catch (e: any) {
        if (!ignore) {
          setState({
            status: "error",
            message: e?.message ?? "We couldn't confirm your payment.",
          });
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  function copyCode() {
    if (state.status !== "ready") return;
    navigator.clipboard?.writeText(state.code).catch(() => {});
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="underline">
        ← Back to home
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Payment successful 🎉</h1>

      {state.status === "loading" && (
        <p className="mt-2">Thanks! We’re generating your gift code and sending the email…</p>
      )}

      {state.status === "error" && (
        <>
          <p className="mt-2 text-red-600">Error: {state.message}</p>
          <p className="mt-6">
            <Link href="/" className="underline">
              Back to home
            </Link>
          </p>
        </>
      )}

      {state.status === "ready" && (
        <>
          <section className="mt-4 rounded border p-4">
            <h2 className="text-lg font-semibold">Your gift is ready 🎁</h2>
            <p className="mt-2">
              Amount:{" "}
              <strong>
                {(state.amount_cents / 100).toLocaleString(undefined, {
                  style: "currency",
                  currency: "USD",
                })}
              </strong>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-gray-100 px-2 py-1 text-lg tracking-widest">
                {state.code}
              </code>
              <button
                onClick={copyCode}
                className="rounded bg-black px-3 py-1 text-white"
                aria-label="Copy gift code"
              >
                Copy
              </button>
            </div>
            <p className="mt-3 text-gray-700">
              We emailed{" "}
              <strong>
                {[
                  state.buyerEmail?.trim(),
                  state.recipientEmail?.trim() &&
                  state.recipientEmail?.trim() !== state.buyerEmail?.trim()
                    ? state.recipientEmail?.trim()
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ") || "the address you provided"}
              </strong>
              .
            </p>
          </section>

          <p className="mt-6">
            <Link href="/" className="underline">
              Back to home
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
