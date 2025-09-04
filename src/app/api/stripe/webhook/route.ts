// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendGiftEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * IMPORTANT:
 * - You must set STRIPE_WEBHOOK_SECRET in .env.local (from `stripe listen`)
 * - This handler uses req.text() (RAW BODY) for signature verification.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil" as any,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function json(detail: any, status = 200) {
  return NextResponse.json(detail, { status });
}

async function fulfillFromSession(session: Stripe.Checkout.Session) {
  // 1) Validate payment
  if (session.payment_status !== "paid") {
    return { ok: false, reason: "payment_status_not_paid" as const };
  }

  // 2) Extract values
  const businessId = session.metadata?.business_id || undefined;
  const buyerEmail =
    session.metadata?.buyer_email ||
    session.customer_details?.email ||
    (session.customer_email as string) ||
    "";

  const recipientEmail = session.metadata?.recipient_email || "";
  const giftMessage = session.metadata?.gift_message || "";
  const sessionId = session.id;

  const totalAmountCents =
    typeof session.amount_total === "number" ? session.amount_total : undefined;
  const currency = (session.currency || "usd").toLowerCase();

  if (!businessId) return { ok: false, reason: "missing_business_id" as const };
  if (!buyerEmail) return { ok: false, reason: "missing_buyer_email" as const };
  if (!Number.isFinite(totalAmountCents) || (totalAmountCents as number) <= 0) {
    return { ok: false, reason: "invalid_amount_total" as const };
  }

  // 3) Lookup business
  const { data: business, error: bizErr } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (bizErr || !business) {
    return { ok: false, reason: "business_not_found" as const, detail: bizErr?.message };
  }

  // 4) Idempotent order upsert by session id
  const { data: existingOrder, error: findOrderErr } = await supabase
    .from("orders")
    .select("id, status")
    .eq("stripe_checkout_session_id", sessionId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (findOrderErr) {
    return { ok: false, reason: "order_find_error" as const, detail: findOrderErr.message };
  }

  let orderId: string | null = existingOrder?.id ?? null;

  if (!orderId) {
    const { data: newOrder, error: createOrderErr } = await supabase
      .from("orders")
      .insert({
        business_id: business.id,
        stripe_payment_intent_id: (session.payment_intent as any)?.id ?? null,
        stripe_checkout_session_id: sessionId,
        buyer_email: buyerEmail,
        recipient_email: recipientEmail || null,
        total_amount_cents: totalAmountCents!,
        currency,
        status: "paid",
      })
      .select("id")
      .single();

    if (createOrderErr || !newOrder) {
      return { ok: false, reason: "order_insert_error" as const, detail: createOrderErr?.message };
    }
    orderId = newOrder.id;
  } else {
    const { error: updateOrderErr } = await supabase
      .from("orders")
      .update({
        stripe_payment_intent_id: (session.payment_intent as any)?.id ?? null,
        buyer_email: buyerEmail,
        recipient_email: recipientEmail || null,
        total_amount_cents: totalAmountCents!,
        currency,
        status: "paid",
      })
      .eq("id", orderId);

    if (updateOrderErr) {
      return { ok: false, reason: "order_update_error" as const, detail: updateOrderErr.message };
    }
  }

  // 5) Idempotent gift card create (one per order)
  const { data: existingGC, error: findGcErr } = await supabase
    .from("gift_cards")
    .select("id, code, remaining_amount_cents, status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (findGcErr) {
    return { ok: false, reason: "gift_card_find_error" as const, detail: findGcErr.message };
  }

  let giftCardCode: string;
  if (existingGC) {
    giftCardCode = existingGC.code;
  } else {
    giftCardCode = `GIF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const { error: gcErr } = await supabase
      .from("gift_cards")
      .insert({
        business_id: business.id,
        order_id: orderId,
        code: giftCardCode,
        initial_amount_cents: totalAmountCents!,
        remaining_amount_cents: totalAmountCents!,
        currency,
        status: "active",
      });

    if (gcErr) {
      return { ok: false, reason: "gift_card_insert_error" as const, detail: gcErr.message };
    }
  }

  // 6) Email (best-effort)
  try {
    const amountUsd = totalAmountCents! / 100;
    const primaryTo = recipientEmail || buyerEmail;
    await sendGiftEmail({
      to: primaryTo,
      businessName: business.name,
      amountUsd,
      code: giftCardCode,
      message: giftMessage || undefined,
    });

    if (recipientEmail && recipientEmail !== buyerEmail) {
      await sendGiftEmail({
        to: buyerEmail,
        businessName: business.name,
        amountUsd,
        code: giftCardCode,
        message: `Copy of the gift sent to ${recipientEmail}. ${giftMessage ?? ""}`.trim(),
      });
    }
  } catch (e) {
    // do not fail fulfillment on email errors
    console.error("[webhook] email send failed:", e);
  }

  return { ok: true as const, code: giftCardCode };
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "missing_signature" }, 400);

  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return json({ error: "server_misconfigured" }, 500);
  }

  let event: Stripe.Event;
  const body = await req.text(); // RAW BODY for signature verification

  try {
    event = stripe.webhooks.constructEvent(body, sig, whSecret);
  } catch (err: any) {
    console.error("[webhook] signature verify failed:", err?.message);
    return json({ error: "invalid_signature" }, 400);
  }

  // Handle only the events we care about
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const result = await fulfillFromSession(session);
    if (!result.ok) {
      console.error("[webhook] fulfillment failed:", result);
      // 2xx so Stripe retries with backoff; we still include details for logs
      return json({ received: true, warn: result }, 200);
    }
    return json({ received: true, code: result.code }, 200);
  }

  // For other events, just acknowledge.
  return json({ received: true }, 200);
}
