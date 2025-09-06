// src/app/api/admin/stripe/backfill-fees/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/src/lib/stripe";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";

export async function POST() {
  if (!stripe) return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Grab recent orders missing any fee fields
  const { data: orders } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50);

  let updated = 0;
  for (const o of orders ?? []) {
    const hasFee =
      o.platform_fee_cents != null ||
      o.application_fee_cents != null ||
      o.application_fee_amount != null;

    if (hasFee) continue;

    const piId: string | null = o.payment_intent_id ?? null;
    const chId: string | null = o.charge_id ?? null;

    let appFeeCents: number | null = null;

    try {
      if (piId) {
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
        const latestCharge = (pi.latest_charge as any) || null;
        appFeeCents = latestCharge?.application_fee_amount ?? null;
      } else if (chId) {
        const ch = await stripe.charges.retrieve(chId);
        appFeeCents = ch.application_fee_amount ?? null;
      }
    } catch {
      // ignore and move on
    }

    if (appFeeCents != null) {
      const update: Record<string, any> = {};
      const cols = Object.keys(o);
      if (cols.includes("platform_fee_cents")) update.platform_fee_cents = appFeeCents;
      if (cols.includes("application_fee_amount")) update.application_fee_amount = appFeeCents / 100;
      if (cols.includes("application_fee_cents")) update.application_fee_cents = appFeeCents;

      if (Object.keys(update).length > 0) {
        await supabase.from("orders").update(update).eq("id", o.id);
        updated++;
      }
    }
  }

  return NextResponse.json({ ok: true, updated });
}
