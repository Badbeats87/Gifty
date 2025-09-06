// src/app/api/admin/stripe/backfill-merchant-fees/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Backfills merchant payout fields for destination charges (your current flow).
 * For destination charges, Stripe processing fee is paid by the PLATFORM, not the merchant.
 * Merchant receives: total_amount_cents - application_fee_cents.
 *
 * This endpoint sets:
 *   - merchant_fee_cents = 0
 *   - merchant_net_cents = total_amount_cents - application_fee_cents
 *
 * Only updates rows where merchant_net_cents is NULL and application_fee_cents is NOT NULL.
 *
 * Usage (dev):
 *   curl -X POST "http://127.0.0.1:3000/api/admin/stripe/backfill-merchant-fees?limit=500"
 *
 * Security: disabled in production unless ADMIN_BACKFILL_ENABLED=true
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") ?? 500)));

  const enabled =
    process.env.ADMIN_BACKFILL_ENABLED === "true" || process.env.NODE_ENV !== "production";
  if (!enabled) {
    return NextResponse.json(
      { ok: false, error: "Backfill disabled. Set ADMIN_BACKFILL_ENABLED=true to allow." },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Fetch candidate orders: have app fee, missing merchant_net
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id,total_amount_cents,application_fee_cents,merchant_fee_cents,merchant_net_cents")
    .is("merchant_net_cents", null)
    .not("application_fee_cents", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let scanned = 0;
  let updated = 0;

  for (const o of orders ?? []) {
    scanned++;
    const total = Number(o.total_amount_cents ?? 0);
    const appFee = Number(o.application_fee_cents ?? 0);

    if (!Number.isFinite(total) || !Number.isFinite(appFee)) continue;

    const merchantNet = total - appFee;
    const merchantFee = 0; // destination charge: merchant does not pay Stripe processing fee

    // Only update if values are sensible
    if (merchantNet >= 0) {
      const { error: upErr } = await supabase
        .from("orders")
        .update({
          merchant_fee_cents: merchantFee,
          merchant_net_cents: merchantNet,
        })
        .eq("id", o.id);

      if (!upErr) updated++;
    }
  }

  return NextResponse.json({ ok: true, scanned, updated });
}
