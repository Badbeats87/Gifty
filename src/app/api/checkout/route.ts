// src/app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil" as any,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      business_id,      // required
      amountUsd,        // required (number)
      buyerEmail,       // required (string) — for now use your Resend test email
      recipientEmail,   // optional
      giftMessage,      // optional
    } = body ?? {};

    if (!business_id || typeof amountUsd !== "number" || !buyerEmail) {
      return NextResponse.json(
        { error: "Missing fields: business_id, amountUsd, buyerEmail" },
        { status: 400 }
      );
    }

    // (Optional) validate business exists and get name for display
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", business_id)
      .single();

    if (bizErr || !business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const unitAmount = Math.max(1, Math.round(amountUsd * 100)); // cents
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Create a standard Checkout Session.
    // (If you already use Connect + commissions, keep your existing transfer/destination params.)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail, // ensures fulfill sees session.customer_details.email
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Gifty for ${business.name}`,
              metadata: { business_id },
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      // Hand-off back to app; the success page will POST to /api/checkout/fulfill with session_id
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cancel`,
      // Critical: send metadata needed by /checkout/fulfill
      metadata: {
        business_id,
        recipient_email: recipientEmail ?? "",
        gift_message: giftMessage ?? "",
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
