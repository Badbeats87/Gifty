// src/app/dashboard/history/page.tsx
import * as React from "react";

// Some repos export a *function* `supabaseAdmin()`; others export a pre-made client as default.
// This import handles both cases gracefully.
import supabaseAdminDefault, { supabaseAdmin as supabaseAdminFactory } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RedemptionRow = {
  code: string;
  redeemedAt: string;
  redeemedBy: string | null;
  businessName: string;
  amount: number;
  currency: string;
};

function getAdminClient(): any {
  // Prefer the named factory if it exists, else the default export.
  const candidate: any = (supabaseAdminFactory as any) ?? (supabaseAdminDefault as any);
  // If it's a function, call it to get a client; otherwise assume it's already a client.
  return typeof candidate === "function" ? candidate() : candidate;
}

function normalizeCurrency(row: any): string {
  const cur =
    row?.currency ??
    row?.currency_code ??
    row?.curr ??
    row?.iso_currency ??
    "USD";
  return String(cur || "USD").toUpperCase();
}

function normalizeAmount(row: any): number {
  if (typeof row?.amount === "number" && Number.isFinite(row.amount)) {
    return row.amount;
  }
  const minorCandidates = [
    "amount_minor",
    "amount_cents",
    "value_minor",
    "value_cents",
    "minor_amount",
  ];
  for (const k of minorCandidates) {
    const v = row?.[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      return Math.round(v) / 100;
    }
  }
  if (row?.value != null) {
    const n = Number(row.value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function loadRedemptions(): Promise<RedemptionRow[]> {
  const supabase = getAdminClient();

  // 1) get latest redemptions from the log table
  const { data: redemptions, error: redErr } = await supabase
    .from("gift_redemptions")
    .select("code, redeemed_at, redeemed_by")
    .order("redeemed_at", { ascending: false })
    .limit(100);

  if (redErr) throw redErr;
  if (!redemptions || redemptions.length === 0) return [];

  // 2) fetch matching gift cards in one go
  const codes = Array.from(new Set(redemptions.map((r: any) => r.code)));
  const { data: gifts, error: giftErr } = await supabase
    .from("gift_cards")
    .select("*")
    .in("code", codes);

  if (giftErr) throw giftErr;

  const giftByCode = new Map<string, any>();
  for (const g of gifts || []) giftByCode.set(g.code, g);

  // 3) join + normalize
  const rows: RedemptionRow[] = redemptions.map((r: any) => {
    const g = giftByCode.get(r.code) || {};
    const businessName =
      g.business_name ??
      g.business ??
      g.merchant_name ??
      "Business";
    const amount = normalizeAmount(g);
    const currency = normalizeCurrency(g);
    return {
      code: r.code,
      redeemedAt: r.redeemed_at,
      redeemedBy: r.redeemed_by ?? null,
      businessName,
      amount,
      currency,
    };
  });

  return rows;
}

export default async function HistoryPage() {
  let rows: RedemptionRow[] = [];
  let loadError: string | null = null;

  try {
    rows = await loadRedemptions();
  } catch (e: any) {
    loadError = e?.message || String(e);
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">Redemption history</h1>

      {loadError ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800">
          Couldn’t load redemptions: {loadError}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-md border p-3 text-gray-600">
          No redemptions yet.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium text-gray-600">Redeemed at</th>
                <th className="px-4 py-2 font-medium text-gray-600">Business</th>
                <th className="px-4 py-2 font-medium text-gray-600">Amount</th>
                <th className="px-4 py-2 font-medium text-gray-600">Code</th>
                <th className="px-4 py-2 font-medium text-gray-600">Redeemed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const amt = new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: r.currency,
                  maximumFractionDigits: 0,
                }).format(r.amount ?? 0);
                const at = new Date(r.redeemedAt).toLocaleString();
                return (
                  <tr key={`${r.code}-${r.redeemedAt}`} className="border-t">
                    <td className="px-4 py-2">{at}</td>
                    <td className="px-4 py-2">{r.businessName}</td>
                    <td className="px-4 py-2">{amt}</td>
                    <td className="px-4 py-2 font-mono">{r.code}</td>
                    <td className="px-4 py-2">{r.redeemedBy ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Showing up to the 100 most recent redemptions. This list updates as new redemptions are logged.
      </p>
    </div>
  );
}
