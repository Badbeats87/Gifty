'use client';

import { useState } from 'react';

export default function ClientBuyForm({ slug, businessName }: { slug: string; businessName: string }) {
  const [amount, setAmount] = useState<number>(25);
  const [buyerEmail, setBuyerEmail] = useState<string>('');
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function startCheckout(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          amountCents: Math.round(Number(amount) * 100),
          buyerEmail: buyerEmail || undefined,
          recipientEmail: recipientEmail || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || 'Failed to start checkout');
        setLoading(false);
        return;
      }
      window.location.href = json.url;
    } catch (err: any) {
      setMsg(err.message || 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={startCheckout} className="grid gap-3 max-w-md">
      <label className="grid gap-1">
        <span className="text-sm text-gray-600">Amount (USD)</span>
        <input
          type="number"
          min={1}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.valueAsNumber || 0)}
          className="border rounded-lg p-3"
          required
        />
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-gray-600">Your email (for receipt)</span>
        <input
          type="email"
          value={buyerEmail}
          onChange={(e) => setBuyerEmail(e.target.value)}
          className="border rounded-lg p-3"
          placeholder="you@example.com"
        />
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-gray-600">Recipient email (optional)</span>
        <input
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          className="border rounded-lg p-3"
          placeholder="friend@example.com"
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
