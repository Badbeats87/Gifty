'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type Biz = { id: string; name: string; slug: string };
type Row = { redeemed_at: string; amount_cents: number; code: string; notes: string | null };

export default function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const run = async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = '/login?next=%2Fdashboard%2Fhistory';
        return;
      }
      setMe(data.user.email ?? null);

      const { data: bizRows, error: bizErr } = await supabase
        .from('businesses')
        .select('id,name,slug')
        .order('created_at', { ascending: true });

      if (bizErr) {
        setError(bizErr.message);
        setLoading(false);
        return;
      }

      const list = (bizRows || []) as Biz[];
      setBusinesses(list);
      const firstId = list[0]?.id ?? null;
      setBusinessId(firstId);
      setLoading(false);

      if (firstId) {
        await load(firstId);
      }
    };
    run();
  }, []);

  async function load(bizId: string) {
    setRefreshing(true);
    setError(null);
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.rpc('list_redemptions', {
        p_business_id: bizId,
      });
      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        setRows((data || []) as Row[]);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load history');
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }

  function handleBizChange(id: string) {
    setBusinessId(id);
    if (id) load(id);
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Redemption History</h1>
        {me && <p className="text-sm text-gray-600">Signed in as <strong>{me}</strong></p>}
      </header>

      {businesses.length === 0 ? (
        <div className="rounded-lg border p-4">
          <p>You don’t have any businesses yet.</p>
          <p className="text-sm text-gray-600">
            Create one in your <a href="/dashboard" className="underline">Dashboard</a>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Business</label>
            <select
              className="border rounded-lg p-2"
              value={businessId ?? ''}
              onChange={(e) => handleBizChange(e.target.value)}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.slug})
                </option>
              ))}
            </select>
            <button
              onClick={() => businessId && load(businessId)}
              className="border rounded-lg px-3 py-2"
              disabled={!businessId || refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <a href="/dashboard/redeem" className="ml-auto underline text-sm">
              Redeem a card →
            </a>
          </div>

          {error && <p className="text-red-600">{error}</p>}

          <div className="rounded-xl border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Code</th>
                  <th className="text-right px-4 py-2">Amount</th>
                  <th className="text-left px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      No redemptions yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2">
                        {new Date(r.redeemed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 font-mono">{r.code}</td>
                      <td className="px-4 py-2 text-right">${(r.amount_cents / 100).toFixed(2)}</td>
                      <td className="px-4 py-2">{r.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
