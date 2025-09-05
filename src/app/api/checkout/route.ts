// src/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * Create a Stripe Checkout Session for buying a gift.
 * Body JSON:
 * - business_id: string (required)
 * - amountUsd: number (required, whole USD)
 * - buyerEmail: string (required)
 * - recipientEmail: string (optional)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const business_id = String(body.business_id ?? "");
    const amountUsd = Number(body.amountUsd ?? 0);
    const buyerEmail = String(body.buyerEmail ?? "");
    const recipientEmail =
      body.recipientEmail ? String(body.recipientEmail) : "";

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    if (!business_id || !Number.isFinite(amountUsd) || amountUsd <= 0 || !buyerEmail) {
      return NextResponse.json(
        {
          error:
            "Missing fields: business_id, amountUsd (>0), buyerEmail are required.",
        },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    });

    // Compute amounts in cents
    const giftAmountCents = Math.round(amountUsd * 100);

    // (Optional) Platform/merchant fees.
    // Keep it simple for now: we JUST charge the gift amount as a single line item.
    // If you want customer service fee + merchant commission split, we can add that after.
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";

    // If you already store the merchant’s Stripe account id in your DB, fetch it here.
    // To keep this file self-contained, we’ll skip that and just create a platform charge.
    // (Destination charges/transfer_data can be added later.)

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: giftAmountCents,
            product_data: {
              name: "Digital gift",
              description: "Gift purchased on Gifty",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cancel`,
      customer_email: buyerEmail,
      allow_promotion_codes: true,
      metadata: {
        business_id,
        amountUsd: String(amountUsd),
        buyerEmail,
        recipientEmail,
      },
    });

    return NextResponse.json({ url: session.url, id: session.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
