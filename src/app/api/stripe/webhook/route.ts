// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/src/lib/stripe";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export const runtime = "nodejs"; // ensure Node runtime for raw body

export async function POST(req: Request) {
  if (!stripe || !WEBHOOK_SECRET) {
    return NextResponse.json({ ok: true, skipped: "Stripe not configured" });
  }

  // Stripe requires raw body for signature verification
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Store every event for traceability (optional table; if missing, we skip)
  try {
    await supabase.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      created_at: new Date().toISOString(),
      payload: event as any,
    });
  } catch {
    // ignore if table doesn't exist
  }

  try {
    switch (event.type) {
      // You may get fees from either charge or PI (depends on flow)
      case "charge.succeeded": {
        const charge = event.data.object as Stripe.Charge;

        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        const chargeId = charge.id;
        const appFeeCents = charge.application_fee_amount ?? null; // integer cents when using Connect application_fee_amount
        // balance transaction may include Stripe processing fee if you ever need it:
        // const balanceTxId = typeof charge.balance_transaction === "string" ? charge.balance_transaction : charge.balance_transaction?.id;

        await updateOrderFees(supabase, {
          paymentIntentId,
          chargeId,
          orderIdFromMetadata: (charge.metadata?.order_id as string) || null,
          platformFeeCents: appFeeCents,
        });

        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const paymentIntentId = pi.id;
        const orderIdFromMetadata = (pi.metadata?.order_id as string) || null;

        // application_fee_amount is not on PI for all flows, but we keep hook symmetry
        const appFeeCents =
          // Some setups put it on latest charge:
          (typeof pi.latest_charge === "object"
            ? (pi.latest_charge as Stripe.Charge).application_fee_amount
            : null) ?? null;

        await updateOrderFees(getSupabaseAdmin(), {
          paymentIntentId,
          chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as any)?.id || null,
          orderIdFromMetadata,
          platformFeeCents: appFeeCents,
        });

        break;
      }
      // add more event types as needed
      default:
        break;
    }
  } catch (err: any) {
    // Persist failure reason for debugging
    try {
      await supabase.from("stripe_event_errors").insert({
        event_id: event.id,
        type: event.type,
        created_at: new Date().toISOString(),
        error: String(err?.message || err),
      });
    } catch {}
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

type UpdateArgs = {
  paymentIntentId: string | null;
  chargeId: string | null;
  orderIdFromMetadata: string | null;
  platformFeeCents: number | null;
};

async function updateOrderFees(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  { paymentIntentId, chargeId, orderIdFromMetadata, platformFeeCents }: UpdateArgs
) {
  if (platformFeeCents == null) return; // nothing to update

  // find a matching order using best-guess fields
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .or(
      [
        orderIdFromMetadata ? `id.eq.${orderIdFromMetadata}` : "",
        paymentIntentId ? `payment_intent_id.eq.${paymentIntentId}` : "",
        chargeId ? `charge_id.eq.${chargeId}` : "",
      ]
        .filter(Boolean)
        .join(",")
    )
    .limit(1);

  const order = orders?.[0];
  if (!order) return;

  // Build an update payload that only touches columns that exist
  const update: Record<string, any> = {};
  const columns = Object.keys(order);

  if (columns.includes("platform_fee_cents")) update.platform_fee_cents = platformFeeCents;
  if (columns.includes("application_fee_amount")) update.application_fee_amount = platformFeeCents / 100;
  if (columns.includes("application_fee_cents")) update.application_fee_cents = platformFeeCents;

  if (Object.keys(update).length === 0) return; // no compatible fee columns

  await supabase.from("orders").update(update).eq("id", order.id);
}
