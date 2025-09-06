// src/app/api/redeem/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";

/**
 * POST /api/redeem
 * Body: { code: string, redeemed_by?: string }
 *
 * Source of truth for redemption is public.gift_redemptions (one row per code).
 * We lookup gift details from gift_cards for display.
 */

type Body = { code?: string; redeemed_by?: string };

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

type RedemptionRow = { code: string; redeemed_at: string; redeemed_by: string | null };

async function getRedemptionRow(code: string) {
  const { data, error } = await supabaseAdmin
    .from("gift_redemptions")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data as RedemptionRow | null;
}

async function insertRedemption(code: string, redeemedBy: string | null) {
  try {
    const { data, error } = await supabaseAdmin
      .from("gift_redemptions")
      .insert({ code, redeemed_by: redeemedBy ?? null })
      .select("*")
      .single();
    if (error) throw error;
    return data as RedemptionRow;
  } catch (e: any) {
    if (isUniqueViolation(e)) {
      const existing = await getRedemptionRow(code);
      if (existing) return existing;
    }
    throw e;
  }
}

async function backfillRedeemedByIfMissing(code: string, redeemedBy: string) {
  if (!redeemedBy) return null;
  const { data, error } = await supabaseAdmin
    .from("gift_redemptions")
    .update({ redeemed_by: redeemedBy })
    .eq("code", code)
    .is("redeemed_by", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as RedemptionRow | null;
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
    const redeemedBy = (body.redeemed_by || "").trim() || null;

    if (!code) {
      return NextResponse.json(
        { ok: false, error: 'Missing "code" in request body' },
        { status: 400 }
      );
    }

    // Lookup gift (for display)
    const gift = await findGiftByCode(code);
    if (!gift) {
      return NextResponse.json(
        { ok: false, error: "Gift not found for that code." },
        { status: 404 }
      );
    }

    const businessName =
      (await findBusinessName(gift.business_id)) || gift.business_name || "Business";
    const currency = normalizeCurrency(gift);
    const amount = normalizeAmount(gift);

    // If already redeemed, return idempotent response (and backfill redeemed_by if missing)
    const existing = await getRedemptionRow(code);
    if (existing) {
      if (!existing.redeemed_by && redeemedBy) {
        const filled = await backfillRedeemedByIfMissing(code, redeemedBy);
        if (filled) {
          return NextResponse.json({
            ok: true,
            already: true,
            redeemed: {
              code,
              amount,
              currency,
              businessName,
              redeemedAt: filled.redeemed_at,
              redeemedBy: filled.redeemed_by,
            },
          });
        }
      }
      return NextResponse.json({
        ok: true,
        already: true,
        redeemed: {
          code,
          amount,
          currency,
          businessName,
          redeemedAt: existing.redeemed_at,
          redeemedBy: existing.redeemed_by,
        },
      });
    }

    // Insert new redemption with redeemed_by if provided
    const row = await insertRedemption(code, redeemedBy);

    return NextResponse.json({
      ok: true,
      redeemed: {
        code,
        amount,
        currency,
        businessName,
        redeemedAt: row.redeemed_at,
        redeemedBy: row.redeemed_by,
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
