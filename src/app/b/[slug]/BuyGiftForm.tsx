"use client";

import { useState } from "react";

export default function BuyGiftForm({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const [amountUsd, setAmountUsd] = useState<number>(25);
  const [buyerEmail, setBuyerEmail] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const dollars = Number.isFinite(amountUsd) ? Math.floor(amountUsd) : 0;
    if (dollars <= 0) {
      setErr("Please enter a valid amount (USD).");
      return;
    }
    if (!buyerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
      setErr("Please enter your email for the receipt.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Field names chosen to match your earlier logs:
          // Missing fields: business_id, amountUsd, buyerEmail
          business_id: businessId,
          amountUsd: dollars,
          buyerEmail,
          recipientEmail: recipientEmail || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Checkout failed with ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      const url = data.url || data.checkoutUrl || data.redirect || data.sessionUrl;
      if (typeof url === "string" && url.startsWith("http")) {
        window.location.href = url;
        return;
      }

      // If API returns {id} for a session but not URL, give a friendly message.
      if (data.id) {
        setErr(
          "Checkout created. Please check your email or try again if you were not redirected."
        );
      } else {
        setErr("Checkout created but no redirect URL was returned.");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong starting checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="border rounded-lg p-4">
      <h2 className="text-lg font-semibold">Buy a gift card</h2>
      <p className="mt-1 text-gray-700">You’re buying a gift for {businessName}.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Amount (USD)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={amountUsd}
            onChange={(e) => setAmountUsd(parseInt(e.target.value || "0", 10))}
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="25"
            required
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Your email (for receipt)</span>
          <input
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">
            Recipient email <span className="text-gray-500">(optional)</span>
          </span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="friend@example.com"
          />
        </label>
      </div>

      {err ? <p className="mt-3 text-red-600">Error: {err}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {loading ? "Starting checkout…" : "Buy with Stripe"}
      </button>
    </form>
  );
}
