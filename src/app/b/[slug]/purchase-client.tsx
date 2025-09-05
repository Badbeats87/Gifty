"use client";

import { useState, FormEvent } from "react";

type Props = {
  businessSlug: string;
  businessName: string;
};

export default function PurchaseClient({ businessSlug, businessName }: Props) {
  const [amountUsd, setAmountUsd] = useState<string>("25");
  const [buyerEmail, setBuyerEmail] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_slug: businessSlug, // <-- IMPORTANT
          amountUsd,
          buyerEmail,
          recipientEmail: recipientEmail || undefined,
          message: message || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Something went wrong");
        setLoading(false);
        return;
      }

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url as string;
        return;
      }

      setError("Unexpected response from server.");
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium">Amount (USD)</label>
        <input
          type="number"
          step="0.01"
          min="1"
          value={amountUsd}
          onChange={(e) => setAmountUsd(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Your email (for receipt)</label>
        <input
          type="email"
          value={buyerEmail}
          onChange={(e) => setBuyerEmail(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="you@example.com"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Recipient email (optional)</label>
        <input
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="friend@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Message (optional)</label>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="Enjoy!"
        />
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Redirecting…" : "Buy with Stripe"}
      </button>

      <p className="text-xs text-gray-500">
        You’re buying a gift card for <strong>{businessName}</strong>.
      </p>
    </form>
  );
}
