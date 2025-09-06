// src/app/api/admin/stripe/backfill-app-fee/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Backfills per-order application fee details using Stripe:
 * - application_fee_cents (gross app fee)
 * - stripe_app_fee_fee_cents (Stripe fee on your app fee)
 * - stripe_app_fee_net_cents (your net on the app fee)
 *
 * Usage (local):
 *   curl -X POST "http://127.0.0.1:3000/api/admin/stripe/backfill-app-fee?limit=100&onlyMissing=1"
 *
 * Query params:
 *   - limit: number of orders to scan (default 100)
 *   - onlyMissing: 1 (default) to update only rows missing net/fee/app_fee
 *
 * Security: dev-only by default. To allow in prod, set ADMIN_BACKFILL_ENABLED=true.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? 100)));
  const onlyMissing = url.searchParams.get("onlyMissing") !== "0";

  // Safety gate
  const enabled =
    process.env.ADMIN_BACKFILL_ENABLED === "true" || process.env.NODE_ENV !== "production";
  if (!enabled) {
    return NextResponse.json(
      { ok: false, error: "Backfill disabled. Set ADMIN_BACKFILL_ENABLED=true to allow." },
      { status: 403 }
    );
  }
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Build base query
  let query = supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (onlyMissing) {
    // prefer rows missing net; otherwise missing fee; otherwise missing app_fee
    query = query.is("stripe_app_fee_net_cents", null).or(
      "stripe_app_fee_fee_cents.is.null,application_fee_cents.is.null"
    );
  }

  const { data: orders, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let scanned = 0;
  let updated = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const o of orders ?? []) {
    scanned++;

    const piId: string | null = o.stripe_payment_intent_id ?? null;
    if (!piId) {
      failures.push({ id: o.id, reason: "Missing stripe_payment_intent_id" });
      continue;
    }

    try {
      const pi = await stripe.paymentIntents.retrieve(piId, {
        expand: ["latest_charge.balance_transaction"],
      });

      const latestCharge =
        (typeof pi.latest_charge === "object" ? (pi.latest_charge as any) : null) ?? null;

      let applicationFeeCents: number | null = null;
      let appFeeStripeFeeCents: number | null = null;
      let appFeeNetCents: number | null = null;

      if (latestCharge) {
        applicationFeeCents = latestCharge.application_fee_amount ?? null;

        // Application Fee object lives on the PLATFORM account
        const fees = await stripe.applicationFees.list({ charge: latestCharge.id, limit: 1 });
        const appFee = fees.data?.[0];

        if (appFee?.balance_transaction) {
          const btId =
            typeof appFee.balance_transaction === "string"
              ? appFee.balance_transaction
              : appFee.balance_transaction.id;
          const bt = await stripe.balanceTransactions.retrieve(btId);
          appFeeStripeFeeCents = bt.fee ?? null;
          appFeeNetCents = bt.net ?? null;
        } else if (applicationFeeCents != null) {
          // Fallback: if we know gross but not fee/net, leave fee null, set net=gross
          appFeeNetCents = applicationFeeCents;
        }
      }

      // Build minimal update
      const toUpdate: Record<string, any> = {};
      const cols = Object.keys(o);
      if (applicationFeeCents != null && cols.includes("application_fee_cents")) {
        toUpdate.application_fee_cents = applicationFeeCents;
      }
      if (appFeeStripeFeeCents != null && cols.includes("stripe_app_fee_fee_cents")) {
        toUpdate.stripe_app_fee_fee_cents = appFeeStripeFeeCents;
      }
      if (appFeeNetCents != null && cols.includes("stripe_app_fee_net_cents")) {
        toUpdate.stripe_app_fee_net_cents = appFeeNetCents;
      }

      if (Object.keys(toUpdate).length > 0) {
        await supabase.from("orders").update(toUpdate).eq("id", o.id);
        updated++;
      }
    } catch (e: any) {
      failures.push({ id: o.id, reason: e?.message ?? String(e) });
      continue;
    }
  }

  return NextResponse.json({ ok: true, scanned, updated, failures });
}
