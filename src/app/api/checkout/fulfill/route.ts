// src/app/api/checkout/fulfill/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendGiftEmail } from "@/lib/email";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil" as any,
});

// Service-role Supabase so RLS won't block server inserts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function bad(detail: any, status = 400) {
  return NextResponse.json({ error: "fulfill_failed", detail }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // --- 0) Parse input ---
    const body = await req.json().catch(() => ({}));
    const sessionId: string | undefined = body?.session_id || body?.sessionId;
    if (!sessionId) return bad("Missing session_id");

    // --- 1) Retrieve Checkout Session (must be paid/complete) ---
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent", "customer", "line_items"],
      });
    } catch (e: any) {
      return bad({ step: "stripe_retrieve_session", message: e?.message });
    }

    if (session.payment_status !== "paid") {
      return bad({ step: "payment_status", payment_status: session.payment_status });
    }

    // --- 2) Extract values we need ---
    const businessId = session.metadata?.business_id || undefined;
    const buyerEmail =
      session.metadata?.buyer_email ||
      session.customer_details?.email ||
      (session.customer_email as string) ||
      "";

    const recipientEmail = session.metadata?.recipient_email || "";
    const giftMessage = session.metadata?.gift_message || "";

    const totalAmountCents =
      typeof session.amount_total === "number" ? session.amount_total : undefined;
    const currency = (session.currency || "usd").toLowerCase();

    if (!businessId) return bad({ step: "metadata", message: "business_id missing" });
    if (!buyerEmail) return bad({ step: "metadata", message: "buyer_email missing" });
    if (!Number.isFinite(totalAmountCents) || (totalAmountCents as number) <= 0) {
      return bad({ step: "amount_validation", message: "Invalid amount_total", amount_total: session.amount_total });
    }

    // --- 3) Get business information ---
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .single();

    if (bizErr || !business) {
      return bad({ step: "business_lookup", message: bizErr?.message || "Business not found" }, 404);
    }

    // --- 4) Upsert an order row (idempotent by checkout session id) ---
    // Try to find existing order by stripe_checkout_session_id
    const { data: existingOrder, error: findOrderErr } = await supabase
      .from("orders")
      .select("id, status")
      .eq("stripe_checkout_session_id", sessionId)
      .eq("business_id", business.id)
      .maybeSingle();

    if (findOrderErr) {
      return bad({ step: "order_find", message: findOrderErr.message }, 500);
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
          status: "paid", // since payment_status is 'paid'
        })
        .select("id")
        .single();

      if (createOrderErr || !newOrder) {
        return bad({ step: "order_insert", message: createOrderErr?.message }, 500);
      }

      orderId = newOrder.id;
    } else {
      // Ensure status is 'paid' (idempotent updates)
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
        return bad({ step: "order_update", message: updateOrderErr.message }, 500);
      }
    }

    // --- 5) Idempotent gift card create (one per order) ---
    const { data: existingGC, error: findGcErr } = await supabase
      .from("gift_cards")
      .select("id, code, remaining_amount_cents, status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (findGcErr) {
      return bad({ step: "gift_card_find", message: findGcErr.message }, 500);
    }

    let giftCardCode: string;
    if (existingGC) {
      giftCardCode = existingGC.code;
    } else {
      giftCardCode = `GIF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      const { data: giftCard, error: gcErr } = await supabase
        .from("gift_cards")
        .insert({
          business_id: business.id,
          order_id: orderId,
          code: giftCardCode,
          initial_amount_cents: totalAmountCents!,
          remaining_amount_cents: totalAmountCents!,
          currency,
          status: "active",
        })
        .select("id, code")
        .single();

      if (gcErr || !giftCard) {
        return NextResponse.json(
          { error: "Failed to create gift card", detail: gcErr?.message ?? gcErr },
          { status: 500 }
        );
      }
    }

    // --- 6) Email delivery (best-effort; won’t fail fulfillment if email errors) ---
    try {
      const amountUsd = (totalAmountCents! / 100);
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
      // Non-fatal: log and continue
      console.error("[fulfill] Email send failed:", e);
    }

    return NextResponse.json({ ok: true, giftCard: { code: giftCardCode } });
  } catch (err: any) {
    console.error("[fulfill] unexpected error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
