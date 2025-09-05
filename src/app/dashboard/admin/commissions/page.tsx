// src/app/dashboard/admin/commissions/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type SettingsResp = {
  defaults: { commission_bps: number; commission_fixed_cents: number };
  overrides: Array<{
    business_slug: string;
    commission_bps: number;
    commission_fixed_cents: number;
    stripe_account_id: string | null;
    notes: string | null;
    updated_at: string;
  }>;
};

type FeesResp = {
  fees: Array<{
    id: string;
    amount: number;
    currency: string;
    created: number;
    account: string | null;
    charge: string | null;
    payment_intent: string | null;
    gift: null | {
      code: string;
      business_slug: string | null;
      buyer_email: string | null;
      recipient_email: string | null;
      amount_cents: number | null;
      currency: string | null;
      stripe_checkout_id: string | null;
      order_id: string | null;
      created_at: string;
    };
  }>;
};

function money(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export default function AdminCommissionsPage() {
  const [settings, setSettings] = useState<SettingsResp | null>(null);
  const [fees, setFees] = useState<FeesResp | null>(null);
  const [loading, setLoading] = useState(true);

  // form state
  const [form, setForm] = useState({
    business_slug: "",
    commission_bps: 500,
    commission_fixed_cents: 50,
    stripe_account_id: "",
    notes: "",
  });
  const defaults = settings?.defaults;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [s, f] = await Promise.all([
          fetch("/api/admin/commissions/settings", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/admin/commissions/fees?limit=10", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!cancelled) {
          setSettings(s as SettingsResp);
          setFees(f as FeesResp);
          if (s?.defaults) {
            setForm((old) => ({
              ...old,
              commission_bps: s.defaults.commission_bps,
              commission_fixed_cents: s.defaults.commission_fixed_cents,
            }));
          }
        }
      } catch (e) {
        // ignore for MVP
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      business_slug: form.business_slug.trim().toLowerCase(),
      commission_bps: Number(form.commission_bps),
      commission_fixed_cents: Number(form.commission_fixed_cents),
      stripe_account_id: form.stripe_account_id.trim() || null,
      notes: form.notes.trim() || null,
    };
    const res = await fetch("/api/admin/commissions/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if ((j as any)?.ok) {
      // refresh list
      const s = await fetch("/api/admin/commissions/settings", { cache: "no-store" }).then((r) => r.json());
      setSettings(s as SettingsResp);
      alert("Saved.");
    } else {
      alert("Failed: " + (j.error || "Unknown error"));
    }
  };

  const sortedOverrides = useMemo(() => (settings?.overrides ?? []).slice().sort((a, b) =>
    a.business_slug.localeCompare(b.business_slug)
  ), [settings]);

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Commissions (Admin)</h1>

      <section className="rounded border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Defaults</h2>
        {defaults ? (
          <p className="text-sm text-gray-700">
            Platform default: <strong>{(defaults.commission_bps / 100).toFixed(2)}%</strong> +{" "}
            <strong>${(defaults.commission_fixed_cents / 100).toFixed(2)}</strong>
          </p>
        ) : (
          <p className="text-sm text-gray-500">Loading defaults…</p>
        )}
      </section>

      <section className="rounded border p-4 space-y-4">
        <h2 className="text-lg font-semibold">Set per-business override</h2>
        <form className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium">Business slug</label>
            <input className="mt-1 w-full rounded border px-3 py-2" placeholder="pams-pupusas"
              value={form.business_slug} onChange={(e) => setForm({ ...form, business_slug: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium">Commission (bps)</label>
            <input type="number" className="mt-1 w-full rounded border px-3 py-2"
              value={form.commission_bps} onChange={(e) => setForm({ ...form, commission_bps: +e.target.value })} />
            <p className="text-xs text-gray-500">500 bps = 5%</p>
          </div>
          <div>
            <label className="block text-sm font-medium">Fixed (cents)</label>
            <input type="number" className="mt-1 w-full rounded border px-3 py-2"
              value={form.commission_fixed_cents} onChange={(e) => setForm({ ...form, commission_fixed_cents: +e.target.value })} />
            <p className="text-xs text-gray-500">$0.50 =&nbsp;50</p>
          </div>
          <div>
            <label className="block text-sm font-medium">Stripe acct (optional)</label>
            <input className="mt-1 w-full rounded border px-3 py-2" placeholder="acct_123..."
              value={form.stripe_account_id} onChange={(e) => setForm({ ...form, stripe_account_id: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button className="rounded bg-black text-white px-4 py-2 h-10 self-end">Save</button>
          </div>
        </form>

        <div>
          <h3 className="font-medium mt-4">Current overrides</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2">Business</th>
                  <th className="p-2">Bps</th>
                  <th className="p-2">Fixed</th>
                  <th className="p-2">Stripe acct</th>
                  <th className="p-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {sortedOverrides.map((r) => (
                  <tr key={r.business_slug} className="border-t">
                    <td className="p-2 font-mono">{r.business_slug}</td>
                    <td className="p-2">{r.commission_bps}</td>
                    <td className="p-2">{r.commission_fixed_cents}</td>
                    <td className="p-2">{r.stripe_account_id ?? "—"}</td>
                    <td className="p-2">{new Date(r.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
                {sortedOverrides.length === 0 && (
                  <tr>
                    <td className="p-2 text-gray-500" colSpan={5}>No overrides yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Recent application fees</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2">When</th>
                <th className="p-2">Fee</th>
                <th className="p-2">Connected</th>
                <th className="p-2">Charge</th>
                <th className="p-2">PaymentIntent</th>
                <th className="p-2">Business</th>
              </tr>
            </thead>
            <tbody>
              {(fees?.fees || []).map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="p-2">{new Date(f.created * 1000).toLocaleString()}</td>
                  <td className="p-2">{money(f.amount, (f.currency || "usd").toUpperCase())}</td>
                  <td className="p-2 font-mono">{f.account || "—"}</td>
                  <td className="p-2">
                    {f.charge ? (
                      <a className="text-blue-600 hover:underline"
                         href={`https://dashboard.stripe.com/test/charges/${f.charge}`} target="_blank">
                        {f.charge}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="p-2 font-mono">{f.payment_intent || "—"}</td>
                  <td className="p-2">{f.gift?.business_slug ?? "—"}</td>
                </tr>
              ))}
              {(!fees || fees.fees.length === 0) && (
                <tr><td className="p-2 text-gray-500" colSpan={6}>No fees yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
