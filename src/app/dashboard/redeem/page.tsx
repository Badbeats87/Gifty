'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type Biz = { id: string; name: string; slug: string };

export default function RedeemPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    remaining_after: number;
    new_status: string;
  } | null>(null);

  useEffect(() => {
    const run = async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = '/login?next=%2Fdashboard%2Fredeem';
        return;
      }
      setMe(data.user.email ?? null);

      // load my businesses
      const { data: bizRows, error } = await supabase
        .from('businesses')
        .select('id,name,slug')
        .order('created_at', { ascending: true });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const list = (bizRows || []) as Biz[];
      setBusinesses(list);
      setBusinessId(list[0]?.id ?? null);
      setLoading(false);
    };

    run();
  }, []);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSuccess(null);

    if (!businessId) {
      setMessage('Select a business first.');
      return;
    }
    const amt = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMessage('Enter a valid USD amount (> 0).');
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) {
      setMessage('Enter a gift card code.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = supabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId,
          code: trimmed,
          amountCents: amt,
          notes: notes || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json.error || 'Redeem failed');
        setSubmitting(false);
        return;
      }

      const remaining = Number(json.remaining_after ?? 0);
      setSuccess({
        remaining_after: remaining,
        new_status: String(json.new_status ?? 'active'),
      });
      setMessage(null);
    } catch (err: any) {
      setMessage(err.message || 'Redeem failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Redeem a Gift Card</h1>
        {me && <p className="text-sm text-gray-600">Signed in as <strong>{me}</strong></p>}
      </header>

      {businesses.length === 0 ? (
        <div className="rounded-lg border p-4">
          <p>You don’t have any businesses yet.</p>
          <p className="text-sm text-gray-600">Create one in your <a href="/dashboard" className="underline">Dashboard</a>.</p>
        </div>
      ) : (
        <form onSubmit={redeem} className="space-y-4 border rounded-xl p-4">
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Business</span>
            <select
              className="border rounded-lg p-3"
              value={businessId ?? ''}
              onChange={(e) => setBusinessId(e.target.value || null)}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Gift card code</span>
            <input
              className="border rounded-lg p-3 font-mono"
              placeholder="e.g. PJL7JYE9JPPJ"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Amount to redeem (USD)</span>
            <input
              type="number"
              min={0.01}
              step="0.01"
              className="border rounded-lg p-3"
              placeholder="e.g. 5.00"
              value={amount}
              onChange={(e) => setAmount(e.target.valueAsNumber || 0)}
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Notes (optional)</span>
            <input
              className="border rounded-lg p-3"
              placeholder="e.g. Lunch special"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <button
            className="bg-black text-white rounded-lg px-4 py-2 disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Redeeming…' : 'Redeem'}
          </button>

          {message && <p className="text-red-600">{message}</p>}

          {success && (
            <div className="rounded-lg border p-3 bg-green-50 space-y-1">
              <p>Redeemed successfully.</p>
              <p>
                Remaining balance:{' '}
                <strong>
                  ${(success.remaining_after / 100).toFixed(2)}
                </strong>{' '}
                — status: <strong>{success.new_status}</strong>
              </p>
            </div>
          )}
        </form>
      )}

      <p className="text-sm text-gray-500">
        Tip: Codes are case-sensitive as generated. If a card shows “Insufficient balance” or “Not found,” check the code and business.
      </p>
    </div>
  );
}
