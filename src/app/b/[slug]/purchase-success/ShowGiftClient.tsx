"use client";

import { useEffect, useState } from "react";

type Gift = {
  code: string;
  amount_cents: number | null;
  initial_amount_cents: number | null;
  remaining_amount_cents: number | null;
  currency: string | null;
  buyer_email: string | null;
  recipient_email: string | null;
  status: string | null;
  stripe_checkout_id: string | null;
  created_at: string | null;
  business_slug: string | null;
};

function money(cents: number | null | undefined, currency = "USD") {
  const n = typeof cents === "number" ? cents : 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      n / 100
    );
  } catch {
    return `$${(n / 100).toFixed(2)} ${currency}`;
  }
}

export default function ShowGiftClient({ sessionId }: { sessionId?: string }) {
  const [gift, setGift] = useState<Gift | null>(null);
  const [tries, setTries] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Poll the API until the webhook has written the row (max ~20s)
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/gift/by-session?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data?.found && data?.gift && active) {
          setGift(data.gift as Gift);
          return; // stop polling
        }
      } catch (e: any) {
        if (active) setError(e?.message || "Network error");
      }
      if (active) {
        setTries((t) => t + 1);
      }
    };

    // First attempt immediately, then every 1s up to ~20 tries
    poll();
    const id = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        Missing session id in the URL.
      </div>
    );
  }

  if (gift) {
    const currency = (gift.currency || "USD").toUpperCase();
    const value =
      gift.amount_cents ?? gift.initial_amount_cents ?? gift.remaining_amount_cents ?? 0;
    return (
      <div className="rounded border border-green-300 bg-green-50 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Your gift is ready 🎁</h2>
        <div className="text-sm text-gray-700">
          Amount: <strong>{money(value, currency)}</strong>
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded border border-green-300 bg-white px-3 py-2 font-mono tracking-widest text-lg">
            {gift.code}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(gift.code)}
            className="rounded bg-black px-3 py-2 text-sm font-semibold text-white"
          >
            Copy
          </button>
        </div>
        {gift.recipient_email ? (
          <p className="text-xs text-gray-600">
            We emailed <strong>{gift.recipient_email}</strong>. The buyer{" "}
            ({gift.buyer_email ?? "—"}) is CC’d for the receipt.
          </p>
        ) : (
          <p className="text-xs text-gray-600">
            We emailed <strong>{gift.buyer_email ?? "your email"}</strong>.
          </p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
      Preparing your gift… {tries}s
    </div>
  );
}
