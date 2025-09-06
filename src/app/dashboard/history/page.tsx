// src/app/dashboard/history/page.tsx
import * as React from "react";
import { createClient } from "@supabase/supabase-js";
import HistoryClient, { type RedemptionRow } from "./HistoryClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

async function getAdminClient(): Promise<any> {
  const candidates = [
    "@/lib/supabaseAdmin",
    "@/lib/supabaseAdminClient",
  ];

  for (const path of candidates) {
    try {
      // @ts-ignore — runtime dynamic import via alias
      const mod = await import(path);
      const def = (mod && "default" in mod ? mod.default : undefined) as any;
      const named =
        (mod && (mod.supabaseAdmin || mod.client || mod.admin)) as any;

      if (typeof named === "function") return named();
      if (named && typeof named.from === "function") return named;
      if (typeof def === "function") return def();
      if (def && typeof def.from === "function") return def;
    } catch {
      // try next
    }
  }

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Could not obtain a Supabase admin client for history export."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "gifty-admin-history" } },
  });
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

function parseRange(searchParams?: PageProps["searchParams"]): "7" | "30" | "90" | "all" {
  const raw = (searchParams?.range ?? searchParams?.["range"]) as
    | string
    | string[]
    | undefined;
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (val === "7" || val === "30" || val === "90" || val === "all") return val;
  return "30"; // default
}

async function loadRedemptions(range: "7" | "30" | "90" | "all"): Promise<RedemptionRow[]> {
  const supabase = await getAdminClient();

  // Build time filter
  let query = supabase
    .from("gift_redemptions")
    .select("code, redeemed_at, redeemed_by")
    .order("redeemed_at", { ascending: false })
    .limit(100);

  if (range !== "all") {
    const days = Number(range);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("redeemed_at", since);
  }

  const { data: redemptions, error: redErr } = await query;
  if (redErr) throw redErr;
  if (!redemptions || redemptions.length === 0) return [];

  const codes = Array.from(new Set(redemptions.map((r: any) => r.code)));
  const { data: gifts, error: giftErr } = await supabase
    .from("gift_cards")
    .select("*")
    .in("code", codes);
  if (giftErr) throw giftErr;

  const giftByCode = new Map<string, any>();
  for (const g of gifts || []) giftByCode.set(g.code, g);

  return redemptions.map((r: any) => {
    const g = giftByCode.get(r.code) || {};
    const businessName =
      g.business_name ?? g.business ?? g.merchant_name ?? "Business";
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
}

export default async function HistoryPage(props: PageProps) {
  const range = parseRange(props.searchParams);
  let rows: RedemptionRow[] = [];
  let loadError: string | null = null;

  try {
    rows = await loadRedemptions(range);
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
        <>
          <HistoryClient rows={rows} range={range} />
          <div className="mt-4 rounded-md border p-3 text-gray-600">
            No redemptions in this range.
          </div>
        </>
      ) : (
        <>
          <HistoryClient rows={rows} range={range} />

          <div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-600">
                    Redeemed at
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600">
                    Business
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600">
                    Amount
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600">Code</th>
                  <th className="px-4 py-2 font-medium text-gray-600">
                    Redeemed by
                  </th>
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
                    <tr
                      key={`${r.code}-${r.redeemedAt}`}
                      className="border-t"
                    >
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
        </>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Filter by date range and export CSV of up to the 100 most recent
        redemptions in view.
      </p>
    </div>
  );
}
