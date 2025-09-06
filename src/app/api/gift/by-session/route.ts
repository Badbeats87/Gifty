// src/app/api/gift/by-session/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";

function normalizeCurrency(row: any): string {
  const cur =
    row?.currency ??
    row?.currency_code ??
    row?.curr ??
    row?.iso_currency ??
    "USD";
  try {
    return String(cur || "USD").toUpperCase();
  } catch {
    return "USD";
  }
}

function normalizeAmount(row: any): number {
  // Prefer a native major-unit amount if it exists and is numeric
  if (typeof row?.amount === "number" && Number.isFinite(row.amount)) {
    return row.amount;
  }
  // Common minor-unit field names → convert to major units
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
  // As a last resort, if value exists as string/number, try to coerce
  if (row?.value != null) {
    const n = Number(row.value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function findGiftBySession(sessionId: string) {
  // Try several likely columns without referencing unknown columns explicitly.
  const ors = [
    `session_id.eq.${sessionId}`,
    `stripe_session_id.eq.${sessionId}`,
    `order_id.eq.${sessionId}`,
    `stripe_checkout_session_id.eq.${sessionId}`,
  ].join(",");

  const { data, error } = await supabaseAdmin
    .from("gift_cards")
    .select("*") // <— no hard-coded columns, avoids “column ... does not exist”
    .or(ors)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id") || url.searchParams.get("sid");
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing "session_id" (or "sid")' },
        { status: 400 }
      );
    }

    const gift = await findGiftBySession(sessionId);

    if (!gift) {
      return NextResponse.json(
        { ok: false, status: "not_found", message: "No gift found for this session yet." },
        { status: 404 }
      );
    }

    // Normalize amount/currency and also attach them onto the raw row so any caller
    // that expects `data.amount` and `data.currency` still works.
    const currency = normalizeCurrency(gift);
    const amount = normalizeAmount(gift);
    const normalized = { ...gift, amount, currency };

    return NextResponse.json({ ok: true, data: normalized });
  } catch (err: any) {
    console.error("[gift/by-session] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
