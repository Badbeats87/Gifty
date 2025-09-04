'use client';

import { useState } from 'react';

export default function ClientBuyForm({
  slug,
  businessName,
  businessId,
}: {
  slug: string;
  businessName: string;
  businessId: string;
}) {
  const [amount, setAmount] = useState<number>(25);
  const [buyerEmail, setBuyerEmail] = useState<string>('');
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [giftMessage, setGiftMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function startCheckout(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    // quick client-side guardrails
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg('Please enter a valid amount.');
      return;
    }
    if (!buyerEmail) {
      setMsg('Please enter your email.');
      return;
    }

    setLoading(true);
    try {
      // IMPORTANT: send the keys the API expects
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          amountUsd: amt,
          buyerEmail,
          recipientEmail: recipientEmail || undefined,
          giftMessage: giftMessage || undefined,
          // slug is still available if your API wants to log it, but not required
          slug,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.error || 'Something went wrong.');
        return;
      }

      // redirect to Stripe Checkout
      if (json?.url) {
        window.location.href = json.url as string;
        return;
      }
      setMsg('Unexpected response from checkout.');
    } catch (err: any) {
      setMsg(err?.message || 'Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={startCheckout} className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Amount (USD)</span>
        <input
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="border rounded-lg p-3 w-full"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Your email (for receipt)</span>
        <input
          type="email"
          value={buyerEmail}
          onChange={(e) => setBuyerEmail(e.target.value)}
          className="border rounded-lg p-3 w-full"
          placeholder="you@example.com"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Recipient email (optional)</span>
        <input
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          className="border rounded-lg p-3 w-full"
          placeholder="friend@example.com"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Message (optional)</span>
        <input
          type="text"
          value={giftMessage}
          onChange={(e) => setGiftMessage(e.target.value)}
          className="border rounded-lg p-3 w-full"
          placeholder="Enjoy!"
        />
      </label>

      <button className="bg-black text-white rounded-lg p-3 disabled:opacity-60" disabled={loading}>
        {loading ? 'Redirecting…' : 'Buy with Stripe'}
      </button>

      {msg && <p className="text-red-600">{msg}</p>}
      <p className="text-xs text-gray-500">You’re buying a gift card for {businessName}.</p>
    </form>
  );
}
