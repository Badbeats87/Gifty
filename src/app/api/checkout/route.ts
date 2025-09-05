// src/app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { computeApplicationFee } from "@/lib/fees";
import { getCommissionOverrideBySlug, supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const amount = Math.max(100, Math.floor(+body.amount_cents || 0)); // min $1
    const buyer_email = String(body.buyer_email || "");
    const recipient_email = body.recipient_email ? String(body.recipient_email) : null;
    const message = body.message ? String(body.message) : undefined;

    // business identification
    const business_id = body.business_id ? String(body.business_id) : null;
    const business_slug = body.business_slug ? String(body.business_slug).toLowerCase() : null;
    if (!business_id && !business_slug) {
      return NextResponse.json({ error: "Unknown business (provide business_id or business_slug)" }, { status: 400 });
    }

    // override lookup (optional)
    const override = business_slug ? await getCommissionOverrideBySlug(business_slug) : null;

    // compute fee
    const application_fee_amount = computeApplicationFee(amount, override || undefined);

    // destination account: per-business override wins; else fallback to env
    const destination =
      override?.stripe_account_id ||
      process.env.DEV_STRIPE_CONNECTED_ACCOUNT_ID ||
      process.env.STRIPE_CONNECTED_ACCOUNT_ID;

    if (!destination) {
      return NextResponse.json({ error: "Missing destination connected account id" }, { status: 500 });
    }

    // create checkout session (destination charges with application fee)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/b/${business_slug || "success"}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/b/${business_slug || ""}`,
      customer_email: buyer_email || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${(business_slug || "Gift")} gift card`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount,
        transfer_data: {
          destination,
        },
        metadata: {
          business_id: business_id || "",
          business_slug: business_slug || "",
          business_name: business_slug ? business_slug.replace(/-/g, " ") : "",
          buyer_email,
          recipient_email: recipient_email || "",
          message: message || "",
        },
      },
      metadata: {
        business_id: business_id || "",
        business_slug: business_slug || "",
        business_name: business_slug ? business_slug.replace(/-/g, " ") : "",
        buyer_email,
        recipient_email: recipient_email || "",
        message: message || "",
      },
    });

    // (best-effort) log checkout intent (optional)
    try {
      await supabaseAdmin.from("checkouts").insert({
        business_id,
        amount_cents: amount,
        buyer_email,
        recipient_email,
        status: "created",
        stripe_checkout_id: session.id,
      } as any);
    } catch (_) {}

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Checkout error" }, { status: 500 });
  }
}
