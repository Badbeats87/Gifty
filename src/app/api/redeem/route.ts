// src/app/api/redeem/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";

/**
 * POST /api/redeem
 * Body: { code: string }
 *
 * Behavior:
 *  - Looks up the gift by code (for display details).
 *  - Uses public.gift_redemptions as the source of truth:
 *      • If a row exists for this code => already redeemed (idempotent).
 *      • Otherwise insert one row (on conflict, read existing) and return success.
 *  - Returns normalized details: code, amount, currency, businessName, redeemedAt.
 */

type Body = { code?: string };

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

function isUniqueViolation(err: any) {
  const msg = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
  return err?.code === "23505" || msg.includes("duplicate key") || msg.includes("already exists");
}

async function findGiftByCode(code: string) {
  const { data, error } = await supabaseAdmin
    .from("gift_cards")
    .select("*")
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getRedemptionRow(code: string) {
  const { data, error } = await supabaseAdmin
    .from("gift_redemptions")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data as { code: string; redeemed_at: string } | null;
}

async function insertRedemption(code: string, redeemedBy: string = "dashboard") {
  // Try insert; if conflict (already redeemed), we'll read the existing row.
  try {
    const { data, error } = await supabaseAdmin
      .from("gift_redemptions")
      .insert({ code, redeemed_by: redeemedBy })
      .select("*")
      .single();
    if (error) throw error;
    return data as { code: string; redeemed_at: string };
  } catch (e: any) {
    if (isUniqueViolation(e)) {
      // Someone redeemed simultaneously — fetch existing
      const existing = await getRedemptionRow(code);
      if (existing) return existing;
    }
    throw e;
  }
}

async function findBusinessName(businessId: any) {
  if (businessId == null) return null;
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data?.name ?? null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const code = (body.code || "").trim();

    if (!code) {
      return NextResponse.json(
        { ok: false, error: 'Missing "code" in request body' },
        { status: 400 }
      );
    }

    // Lookup gift (for details)
    const gift = await findGiftByCode(code);
    if (!gift) {
      return NextResponse.json(
        { ok: false, error: "Gift not found for that code." },
        { status: 404 }
      );
    }

    // Check if already redeemed
    const existing = await getRedemptionRow(code);
    const businessName =
      (await findBusinessName(gift.business_id)) || gift.business_name || "Business";
    const currency = normalizeCurrency(gift);
    const amount = normalizeAmount(gift);

    if (existing) {
      return NextResponse.json({
        ok: true,
        already: true,
        redeemed: {
          code,
          amount,
          currency,
          businessName,
          redeemedAt: existing.redeemed_at,
        },
      });
    }

    // Insert redemption row (idempotent with PK on code)
    const inserted = await insertRedemption(code, "dashboard");

    return NextResponse.json({
      ok: true,
      redeemed: {
        code,
        amount,
        currency,
        businessName,
        redeemedAt: inserted.redeemed_at,
      },
    });
  } catch (err: any) {
    console.error("[redeem] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
