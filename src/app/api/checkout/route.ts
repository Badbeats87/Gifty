// src/app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil" as any,
});

// Server-side Supabase (service role)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple helpers
function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}
function envRequired(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const APP_URL = envRequired("NEXT_PUBLIC_APP_URL");

    const body = await req.json().catch(() => ({}));
    const {
      businessId,
      amountUsd,
      buyerEmail,
      recipientEmail,
      giftMessage,
      // NOTE: client can pass slug, but we’ll fetch from DB to be safe
      slug: _ignoredSlug,
    } = body ?? {};

    // Basic validation
    if (!businessId) return bad("Missing fields: businessId");
    if (!buyerEmail) return bad("Missing fields: buyerEmail");
    const amt = Number(amountUsd);
    if (!Number.isFinite(amt) || amt <= 0) return bad("Invalid amount");

    // Look up business (need slug for success_url and Stripe account for destination charges)
    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("id, slug, name, stripe_account_id")
      .eq("id", businessId)
      .single();

    if (bizErr) return bad(`Business lookup failed: ${bizErr.message}`, 500);
    if (!biz) return bad("Business not found", 404);
    if (!biz.stripe_account_id) return bad("Business is not connected to Stripe", 400);

    // Commission model (platform fee taken via application_fee_amount)
    // Adjust percentages as needed.
    const PLATFORM_FEE_RATE = 0.10; // 10% to platform (example)
    const applicationFeeAmount = Math.round(amt * 100 * PLATFORM_FEE_RATE);

    // Build URLs that actually exist — success on the business page with session_id
    const successUrl = `${APP_URL}/b/${biz.slug}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${APP_URL}/b/${biz.slug}?canceled=1`;

    // Create Checkout Session (destination charge to connected account)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "usd",
      customer_email: buyerEmail,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amt * 100),
            product_data: {
              name: `Gift card for ${biz.name}`,
              metadata: {
                business_id: biz.id,
              },
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: biz.stripe_account_id!,
        },
      },
      metadata: {
        business_id: biz.id,
        amount_usd: String(amt),
        buyer_email: buyerEmail,
        recipient_email: recipientEmail || "",
        gift_message: giftMessage || "",
      },
      // Helpful to ensure full customer_details are populated
      customer_creation: "if_required",
      allow_promotion_codes: true,
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
