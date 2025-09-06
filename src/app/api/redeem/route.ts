// src/app/api/redeem/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";

/**
 * POST /api/redeem
 * Body: { code: string }
 *
 * Behavior:
 *  - Finds the gift by code
 *  - If already redeemed, returns a clear message (idempotent)
 *  - Otherwise attempts RPC "redeem_gift_card(p_code text)" if present
 *    and gracefully falls back to direct updates when the function is missing.
 *  - Responds with normalized details: code, amount, currency, businessName, redeemedAt
 */

type Body = { code?: string };

function isMissingColumn(err: any) {
  const msg = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
  return err?.code === "42703" || msg.includes("does not exist") && msg.includes("column");
}

function isUndefinedFunction(err: any) {
  const msg = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
  // Postgres undefined_function is 42883. Supabase sometimes surfaces a
  // friendlier message like "Could not find the function ... in the schema cache".
  return (
    err?.code === "42883" ||
    msg.includes("function") && msg.includes("does not exist") ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache")
  );
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

function alreadyRedeemed(row: any): boolean {
  if (row?.redeemed === true) return true;
  if (row?.is_redeemed === true) return true;
  if (row?.redeemed_at) return true;
  return false;
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

async function ensureRedeemed(row: any) {
  // Try RPC first if present
  try {
    const rpc = await supabaseAdmin.rpc("redeem_gift_card", { p_code: row.code });
    if (rpc.error) {
      if (isUndefinedFunction(rpc.error)) {
        // Missing RPC -> fall back silently
      } else {
        throw rpc.error;
      }
    } else {
      // RPC worked, refetch latest row
      const refreshed = await findGiftByCode(row.code);
      return refreshed || row;
    }
  } catch (e: any) {
    if (!isUndefinedFunction(e)) {
      // Real error, not just "function missing"
      throw e;
    }
    // Else: swallow and fall through to SQL fallback
  }

  // Fallback: set redeemed_at = now() if that column exists
  try {
    const { data, error } = await supabaseAdmin
      .from("gift_cards")
      .update({ redeemed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("redeemed_at", null)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data || row;
  } catch (e: any) {
    // If redeemed_at column doesn't exist, try a boolean flag
    if (isMissingColumn(e)) {
      const { data, error } = await supabaseAdmin
        .from("gift_cards")
        .update({ redeemed: true })
        .eq("id", row.id)
        .eq("redeemed", false)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data || row;
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

    const row = await findGiftByCode(code);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Gift not found for that code." },
        { status: 404 }
      );
    }

    // If already redeemed, surface as idempotent success-ish response
    if (alreadyRedeemed(row)) {
      const businessName = await findBusinessName(row.business_id);
      const currency = normalizeCurrency(row);
      const amount = normalizeAmount(row);
      return NextResponse.json({
        ok: true,
        already: true,
        redeemed: {
          code: row.code,
          amount,
          currency,
          businessName: businessName || row.business_name || "Business",
          redeemedAt: row.redeemed_at || null,
        },
      });
    }

    // Attempt to redeem now (RPC or fallback)
    const updated = await ensureRedeemed(row);
    const businessName = await findBusinessName(updated.business_id);
    const currency = normalizeCurrency(updated);
    const amount = normalizeAmount(updated);

    return NextResponse.json({
      ok: true,
      redeemed: {
        code: updated.code,
        amount,
        currency,
        businessName: businessName || updated.business_name || "Business",
        redeemedAt: updated.redeemed_at || new Date().toISOString(),
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
