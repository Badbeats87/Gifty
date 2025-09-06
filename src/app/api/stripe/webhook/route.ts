// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/**
 * Handles:
 * - checkout.session.completed  -> upsert order
 * - payment_intent.succeeded    -> upsert order
 * - charge.succeeded            -> update fees (application_fee + app-fee Stripe fee/net + merchant fee/net)
 *
 * We rely on metadata.business_id to satisfy NOT NULL business_id on insert.
 * We also try to infer the connected account id from:
 *   - payment_intent.transfer_data.destination
 *   - charge.transfer_data.destination
 *   - payment_intent.on_behalf_of
 *   - metadata.destinationAccount (from your checkout route)
 *   - the businesses table (stripe_account_id, etc.)
 */
export async function POST(req: Request) {
  if (!stripe || !WEBHOOK_SECRET) {
    return NextResponse.json({ ok: true, skipped: "Stripe not configured" });
  }

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
          typeof s.amount_total === "number" ? s.amount_total : 0;
        const currency = (s.currency ?? "usd").toLowerCase();

        if (!businessId) {
          await logWebhookError(
            supabase,
            event,
            "Missing metadata.business_id on checkout.session.completed"
          );
          break;
        }

        await upsertOrder(supabase, {
          business_id: businessId,
          stripe_checkout_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
          buyer_email: buyerEmail,
          recipient_email: recipientEmail,
          total_amount_cents: totalAmountCents,
          currency,
          status: "succeeded",
        });

        if (paymentIntentId) {
          await tryUpdateAppFeeFields(supabase, paymentIntentId);
          await tryUpdateMerchantFeeFields(supabase, paymentIntentId);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const businessId = (pi.metadata?.business_id as string | undefined) ?? null;
        const paymentIntentId = pi.id;
        const buyerEmail =
          (pi.receipt_email as string | null) ??
          (typeof pi.customer === "object" ? (pi.customer?.email as string | null) : null);
        const recipientEmail = (pi.metadata?.recipient_email as string | undefined) ?? null;
        const totalAmountCents = typeof pi.amount === "number" ? pi.amount : 0;
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
          stripe_checkout_session_id: null,
          stripe_payment_intent_id: paymentIntentId,
          buyer_email: buyerEmail,
          recipient_email: recipientEmail,
          total_amount_cents: totalAmountCents,
          currency,
          status: "succeeded",
        });

        await tryUpdateAppFeeFields(supabase, paymentIntentId);
        await tryUpdateMerchantFeeFields(supabase, paymentIntentId);
        break;
      }

      case "charge.succeeded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;

        if (paymentIntentId) {
          await tryUpdateAppFeeFields(supabase, paymentIntentId);
          await tryUpdateMerchantFeeFields(supabase, paymentIntentId);
        }
        break;
      }

      default:
        // ignore
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
    // optional tables may not exist; ignore
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
    await supabase
      .from("orders")
      .update({
        stripe_payment_intent_id:
          payload.stripe_payment_intent_id ?? existing.stripe_payment_intent_id,
        stripe_checkout_session_id:
          payload.stripe_checkout_session_id ?? existing.stripe_checkout_session_id,
        buyer_email: payload.buyer_email ?? existing.buyer_email,
        recipient_email: payload.recipient_email ?? existing.recipient_email,
        currency: payload.currency ?? existing.currency,
        total_amount_cents:
          typeof payload.total_amount_cents === "number"
            ? payload.total_amount_cents
            : existing.total_amount_cents,
        status: payload.status ?? existing.status,
      })
      .eq("id", existing.id);
  } else {
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
 * Update per-order app-fee fields (platform revenue and net after Stripe Connect fee)
 * - application_fee_cents
 * - stripe_app_fee_fee_cents
 * - stripe_app_fee_net_cents
 */
async function tryUpdateAppFeeFields(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  paymentIntentId: string
) {
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .limit(1);
  const order = orders?.[0];
  if (!order) return;

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });

  const latestCharge =
    (typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null) ||
    null;

  let applicationFeeCents: number | null = null;
  let appFeeStripeFeeCents: number | null = null;
  let appFeeNetCents: number | null = null;

  if (latestCharge) {
    applicationFeeCents = latestCharge.application_fee_amount ?? null;

    try {
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
      }
    } catch {
      // If Connect plan doesn't expose this, skip gracefully
    }
  }

  const cols = Object.keys(order);
  const update: Record<string, any> = {};

  if (applicationFeeCents != null && cols.includes("application_fee_cents")) {
    update.application_fee_cents = applicationFeeCents;
  }
  if (appFeeStripeFeeCents != null && cols.includes("stripe_app_fee_fee_cents")) {
    update.stripe_app_fee_fee_cents = appFeeStripeFeeCents;
  }
  if (appFeeNetCents != null && cols.includes("stripe_app_fee_net_cents")) {
    update.stripe_app_fee_net_cents = appFeeNetCents;
  } else if (
    applicationFeeCents != null &&
    appFeeStripeFeeCents != null &&
    cols.includes("stripe_app_fee_net_cents")
  ) {
    update.stripe_app_fee_net_cents = applicationFeeCents - appFeeStripeFeeCents;
  }

  if (Object.keys(update).length > 0) {
    await supabase.from("orders").update(update).eq("id", order.id);
  }
}

/**
 * Update merchant-side fee fields (connected account):
 * - merchant_fee_cents   (Stripe processing fee on the merchant's charge)
 * - merchant_net_cents   (what merchant actually receives)
 * - merchant_stripe_account_id (for traceability)
 * - merchant_balance_tx_id     (the merchant-side BT id)
 */
async function tryUpdateMerchantFeeFields(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  paymentIntentId: string
) {
  // 1) Find order
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .limit(1);
  const order = orders?.[0];
  if (!order) return;

  // 2) Retrieve PI (platform) with expansions so we can infer acct + BT id
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: [
      "latest_charge.balance_transaction",
      "transfer_data.destination",
      "on_behalf_of",
      "latest_charge.transfer_data.destination",
    ],
  });

  const latestCharge =
    (typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null) ||
    null;

  // 3) Determine the connected account id (acct_...)
  const acctFromPiTransfer =
    (pi.transfer_data as any)?.destination ??
    (typeof (pi.transfer_data as any)?.destination === "object"
      ? (pi.transfer_data as any).destination?.id
      : null);

  const acctFromPiOBO =
    typeof pi.on_behalf_of === "string"
      ? (pi.on_behalf_of as string)
      : (pi.on_behalf_of as any)?.id ?? null;

  const acctFromChargeTransfer =
    (latestCharge as any)?.transfer_data?.destination ??
    (typeof (latestCharge as any)?.transfer_data?.destination === "object"
      ? (latestCharge as any).transfer_data.destination?.id
      : null);

  const acctFromMetadata = (pi.metadata?.destinationAccount as string | undefined) ?? null;

  // If still unknown, try via our DB businesses table
  let acctFromBusiness: string | null = null;
  if (order.business_id) {
    const { data: bizArr } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", order.business_id)
      .limit(1);
    const b = bizArr?.[0] ?? null;
    if (b) {
      const candidates = [
        b.stripe_account_id,
        b.stripe_connect_account_id,
        b.stripe_connected_account,
        b.stripe_connect_id,
        b.stripe_account,
      ].filter((v: any) => typeof v === "string") as string[];
      acctFromBusiness = candidates.find((v) => v.startsWith("acct_")) ?? null;
    }
  }

  const connectedAccountId =
    acctFromChargeTransfer ||
    acctFromPiTransfer ||
    acctFromPiOBO ||
    acctFromMetadata ||
    acctFromBusiness ||
    null;

  if (!latestCharge || !connectedAccountId) {
    // Can't compute merchant-side fees without charge + account
    return;
  }

  // 4) Merchant-side balance transaction
  const btId =
    typeof latestCharge.balance_transaction === "string"
      ? (latestCharge.balance_transaction as string)
      : (latestCharge.balance_transaction as any)?.id ?? null;

  if (!btId) return;

  let merchantFeeCents: number | null = null;
  let merchantNetCents: number | null = null;

  try {
    const merchantBT = await stripe.balanceTransactions.retrieve(btId, {
      // IMPORTANT: do this on the CONNECTED ACCOUNT to see merchant-side fee/net
      stripeAccount: connectedAccountId,
    });
    merchantFeeCents = merchantBT.fee ?? null;
    merchantNetCents = merchantBT.net ?? null;
  } catch {
    // If we can't retrieve merchant-side BT (e.g., permissions), skip gracefully
  }

  const cols = Object.keys(order);
  const update: Record<string, any> = {};
  if (connectedAccountId && cols.includes("merchant_stripe_account_id")) {
    update.merchant_stripe_account_id = connectedAccountId;
  }
  if (btId && cols.includes("merchant_balance_tx_id")) {
    update.merchant_balance_tx_id = btId;
  }
  if (merchantFeeCents != null && cols.includes("merchant_fee_cents")) {
    update.merchant_fee_cents = merchantFeeCents;
  }
  if (merchantNetCents != null && cols.includes("merchant_net_cents")) {
    update.merchant_net_cents = merchantNetCents;
  }

  if (Object.keys(update).length > 0) {
    await supabase.from("orders").update(update).eq("id", order.id);
  }
}
