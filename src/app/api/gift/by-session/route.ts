// src/app/api/gift/by-session/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";

const CANDIDATE_COLS = [
  "session_id",
  "stripe_session_id",
  "order_id",
  "stripe_checkout_session_id",
  "checkout_session_id",
];

function isMissingColumn(err: any) {
  // Postgres code for "undefined_column" is 42703; also match message text
  const msg = (err?.message || "").toLowerCase();
  return err?.code === "42703" || msg.includes("does not exist");
}

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

async function findGiftBySession(sessionId: string) {
  for (const col of CANDIDATE_COLS) {
    try {
      const { data, error } = await supabaseAdmin
        .from("gift_cards")
        .select("*")
        .eq(col, sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        if (isMissingColumn(error)) continue; // try next column
        throw error; // real error
      }
      if (data) return data;
    } catch (e: any) {
      if (isMissingColumn(e)) continue;
      throw e;
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId =
      url.searchParams.get("session_id") || url.searchParams.get("sid");
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing "session_id" (or "sid")' },
        { status: 400 }
      );
    }

    const gift = await findGiftBySession(sessionId);

    if (!gift) {
      return NextResponse.json(
        {
          ok: false,
          status: "not_found",
          message: "No gift found for this session yet.",
        },
        { status: 404 }
      );
    }

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
