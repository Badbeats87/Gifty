// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

export const runtime = "nodejs"; // raw body + Stripe signature verification

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/**
 * We support:
 * - checkout.session.completed  -> create/upsert an order
 * - payment_intent.succeeded    -> create/upsert an order (fallback if you don't use Checkout)
 * - charge.succeeded            -> update fees into existing orders (if fee columns exist)
 *
 * REQUIREMENT to create an order row:
 *   metadata.business_id must be present on the Session or PaymentIntent
 *   (UUID of a row in public.businesses).
 *
 * OPTIONAL metadata we read if provided:
 *   - metadata.recipient_email
 */
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
    return NextResponse.json(
      { error: `Webhook signature failed: ${err.message}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Store every event for traceability (optional table; if missing, we skip)
  await safeInsert(supabase, "stripe_events", {
    id: event.id,
    type: event.type,
    created_at: new Date().toISOString(),
    payload: event as any,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;

        // Extract data for orders row
        const businessId = (s.metadata?.business_id as string | undefined) ?? null;
        const sessionId = s.id;
        const paymentIntentId =
          typeof s.payment_intent === "string"
            ? s.payment_intent
            : s.payment_intent?.id ?? null;
        const buyerEmail =
          s.customer_details?.email ?? (s.customer_email as string | null) ?? null;
        const recipientEmail = (s.metadata?.recipient_email as string | undefined) ?? null;
        const totalAmountCents =
          typeof s.amount_total === "number" ? s.amount_total : null;
        const currency = (s.currency ?? "usd").toLowerCase();

        if (!businessId) {
          await logWebhookError(
            supabase,
            event,
            "Missing metadata.business_id on checkout.session.completed"
          );
          break;
        }
        if (totalAmountCents == null) {
          // We still create the order with 0 if Checkout total isn't present (rare),
          // but usually amount_total is available on completed session.
          // You can backfill later from PI/charge.
        }

        await upsertOrder(supabase, {
          business_id: businessId,
          stripe_checkout_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
          buyer_email: buyerEmail,
          recipient_email: recipientEmail,
          total_amount_cents: totalAmountCents ?? 0,
          currency,
          status: "succeeded",
        });

        // Also try to update fee columns based on latest charge if present
        // (optional; no-op if your schema doesn't have fee columns)
        if (paymentIntentId) {
          await tryUpdateFeesFromPI(supabase, paymentIntentId);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const businessId = (pi.metadata?.business_id as string | undefined) ?? null;
        const paymentIntentId = pi.id;
        const sessionId =
          typeof pi.latest_charge === "object" &&
          (pi.latest_charge as any)?.checkout_session
            ? ((pi.latest_charge as any).checkout_session as string)
            : null;
        const buyerEmail =
          (pi.receipt_email as string | null) ??
          (typeof pi.customer === "object"
            ? (pi.customer?.email as string | null)
            : null);
        const recipientEmail = (pi.metadata?.recipient_email as string | undefined) ?? null;
        const totalAmountCents =
          typeof pi.amount === "number" ? pi.amount : null;
        const currency = (pi.currency ?? "usd").toLowerCase();

        if (!businessId) {
          await logWebhookError(
            supabase,
            event,
            "Missing metadata.business_id on payment_intent.succeeded"
          );
          break;
        }

        await upsertOrder(supabase, {
          business_id: businessId,
          stripe_checkout_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
          buyer_email: buyerEmail,
          recipient_email: recipientEmail,
          total_amount_cents: totalAmountCents ?? 0,
          currency,
          status: "succeeded",
        });

        // Try fee update from PI/charge (optional)
        await tryUpdateFeesFromPI(supabase, paymentIntentId);
        break;
      }

      case "charge.succeeded": {
        // Keep your previous fee update behavior (optional)
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
        if (paymentIntentId) {
          await tryUpdateFeesFromPI(supabase, paymentIntentId);
        }
        break;
      }

      default:
        // ignore others for now
        break;
    }
  } catch (err: any) {
    await logWebhookError(supabase, event, err?.message || String(err));
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ----------------- helpers -----------------

async function safeInsert(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  row: Record<string, any>
) {
  try {
    await supabase.from(table).insert(row);
  } catch {
    // table may not exist; ignore
  }
}

async function logWebhookError(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  event: Stripe.Event,
  message: string
) {
  await safeInsert(supabase, "stripe_event_errors", {
    event_id: event.id,
    type: event.type,
    created_at: new Date().toISOString(),
    error: message,
  });
}

/**
 * Upsert strategy:
 * - If we find an existing order by `stripe_payment_intent_id` or `stripe_checkout_session_id`,
 *   we UPDATE mutable fields (emails, total, currency, status).
 * - Else we INSERT a new row (business_id is required by your schema).
 */
async function upsertOrder(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  payload: {
    business_id: string;
    stripe_payment_intent_id: string | null;
    stripe_checkout_session_id: string | null;
    buyer_email: string | null;
    recipient_email: string | null;
    total_amount_cents: number;
    currency: string;
    status: string;
  }
) {
  const { stripe_payment_intent_id, stripe_checkout_session_id } = payload;

  // Try to find existing by PI first, then by Checkout Session
  const { data: existingByPi } = stripe_payment_intent_id
    ? await supabase
        .from("orders")
        .select("*")
        .eq("stripe_payment_intent_id", stripe_payment_intent_id)
        .limit(1)
    : { data: null as any };

  const existing =
    existingByPi?.[0] ??
    (await (async () => {
      if (!stripe_checkout_session_id) return null;
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("stripe_checkout_session_id", stripe_checkout_session_id)
        .limit(1);
      return data?.[0] ?? null;
    })());

  if (existing) {
    const update: Record<string, any> = {};
    // only set fields if they exist in your schema (they do)
    update.stripe_payment_intent_id = payload.stripe_payment_intent_id ?? existing.stripe_payment_intent_id;
    update.stripe_checkout_session_id = payload.stripe_checkout_session_id ?? existing.stripe_checkout_session_id;
    update.buyer_email = payload.buyer_email ?? existing.buyer_email;
    update.recipient_email = payload.recipient_email ?? existing.recipient_email;
    update.currency = payload.currency ?? existing.currency;
    update.total_amount_cents =
      typeof payload.total_amount_cents === "number"
        ? payload.total_amount_cents
        : existing.total_amount_cents;
    update.status = payload.status ?? existing.status;

    await supabase.from("orders").update(update).eq("id", existing.id);
  } else {
    // Insert new row (business_id is NOT NULL in your schema)
    await supabase.from("orders").insert({
      business_id: payload.business_id,
      stripe_payment_intent_id: payload.stripe_payment_intent_id,
      stripe_checkout_session_id: payload.stripe_checkout_session_id,
      buyer_email: payload.buyer_email,
      recipient_email: payload.recipient_email,
      total_amount_cents: payload.total_amount_cents,
      currency: payload.currency,
      status: payload.status,
    });
  }
}

/**
 * Optional: Update fee columns if your `orders` table has them.
 * We detect which columns exist by reading one row first (if any).
 */
async function tryUpdateFeesFromPI(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  paymentIntentId: string
) {
  // Find the order by payment_intent_id
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .limit(1);
  const order = orders?.[0];
  if (!order) return;

  // Expand latest charge to read application_fee_amount (cents)
  let appFeeCents: number | null = null;
  try {
    const pi = await (await import("@/lib/stripe")).stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge"] }
    );
    const latestCharge = (pi.latest_charge as any) || null;
    appFeeCents = latestCharge?.application_fee_amount ?? null;
  } catch {
    // ignore
  }

  if (appFeeCents == null) return;

  const cols = Object.keys(order);
  const update: Record<string, any> = {};
  if (cols.includes("platform_fee_cents")) update.platform_fee_cents = appFeeCents;
  if (cols.includes("application_fee_amount")) update.application_fee_amount = appFeeCents / 100;
  if (cols.includes("application_fee_cents")) update.application_fee_cents = appFeeCents;

  if (Object.keys(update).length > 0) {
    await supabase.from("orders").update(update).eq("id", order.id);
  }
}
