// src/app/dashboard/redeem/page.tsx
"use client";

import { useState } from "react";

type RedeemResponse =
  | { ok: true; gift: {
      code: string;
      currency: string;
      amount_cents: number;
      initial_amount_cents: number;
      remaining_amount_cents: number;
      status: string;
      business_slug: string | null;
      buyer_email: string | null;
      recipient_email: string | null;
      order_id: string | null;
      stripe_checkout_id: string | null;
      created_at: string;
    } }
  | { error: string };

function money(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format((cents || 0) / 100);
  } catch {
    return `$${((cents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

export default function RedeemPage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<RedeemResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResp(null);
    try {
      const r = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = (await r.json()) as RedeemResponse;
      setResp(j);
    } catch (err: any) {
      setResp({ error: err?.message || "Network error" });
    } finally {
      setBusy(false);
    }
  }

  const ok = (resp as any)?.ok === true;
  const gift = ok ? (resp as any).gift : null;

  return (
    <div className="mx-auto max-w-xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Redeem a gift</h1>
      <p className="text-sm text-gray-600">
        Enter the gift code shown by the customer. Codes look like <code>ABCD-EFGH-IJKL</code>.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Gift code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD-EFGH-IJKL"
            className="mt-1 w-full rounded border px-3 py-2 tracking-wider uppercase"
            required
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Checking…" : "Redeem"}
        </button>
      </form>

      {resp && "error" in resp && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {resp.error}
        </div>
      )}

      {ok && gift && (
        <div className="rounded border border-green-300 bg-green-50 p-4">
          <h2 className="text-lg font-semibold">Redeemed ✅</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-600">Code</div>
            <div className="font-mono">{gift.code}</div>

            <div className="text-gray-600">Amount</div>
            <div>{money(gift.amount_cents, gift.currency)}</div>

            <div className="text-gray-600">Remaining</div>
            <div>{money(gift.remaining_amount_cents, gift.currency)}</div>

            <div className="text-gray-600">Status</div>
            <div className="capitalize">{gift.status}</div>

            {gift.buyer_email && (
              <>
                <div className="text-gray-600">Buyer</div>
                <div className="truncate">{gift.buyer_email}</div>
              </>
            )}

            {gift.recipient_email && (
              <>
                <div className="text-gray-600">Recipient</div>
                <div className="truncate">{gift.recipient_email}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
