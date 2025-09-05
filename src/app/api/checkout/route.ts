// src/app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { computeFees } from "@/lib/fees";
import {
  getBusinessById,
  getBusinessBySlug,
  recordCheckoutIntent,
} from "@/lib/db";

type Body =
  | {
      business_id?: string;
      business_slug?: string;
      amountUsd?: number | string;
      buyerEmail?: string;
      recipientEmail?: string;
    }
  | undefined;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
if (!APP_URL) {
  throw new Error("NEXT_PUBLIC_APP_URL not set");
}

function parseAmountCents(amountUsd: number | string | undefined) {
  if (amountUsd === undefined || amountUsd === null || amountUsd === "") {
    throw new Error("Missing field: amountUsd");
  }
  const asNumber =
    typeof amountUsd === "string" ? Number(amountUsd) : Number(amountUsd);
  if (!Number.isFinite(asNumber)) throw new Error("Invalid amount");
  // Allow decimals like 25.50
  const cents = Math.round(asNumber * 100);
  if (cents <= 0) throw new Error("Invalid amount");
  return cents;
}

export async function POST(req: NextRequest) {
  try {
    const json = (await req.json()) as Body;

    const businessId = json?.business_id;
    const businessSlug = json?.business_slug;
    const buyerEmail = json?.buyerEmail;
    const recipientEmail = json?.recipientEmail ?? null;

    if (!buyerEmail) {
      return NextResponse.json(
        { error: "Missing field: buyerEmail" },
        { status: 400 }
      );
    }

    // Resolve business
    let business =
      (businessId ? await getBusinessById(businessId) : null) ??
      (businessSlug ? await getBusinessBySlug(businessSlug) : null);

    if (!business) {
      return NextResponse.json(
        { error: "Unknown business (provide business_id or business_slug)" },
        { status: 400 }
      );
    }

    if (!business.stripe_account_id) {
      return NextResponse.json(
        { error: "Business is not connected to Stripe yet." },
        { status: 400 }
      );
    }

    const amountCents = parseAmountCents(json?.amountUsd);
    const { applicationFeeAmount } = computeFees(amountCents);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${business.name} – Gift Card`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${APP_URL}/b/${business.slug}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/b/${business.slug}`,
      customer_email: buyerEmail,
      metadata: {
        business_id: business.id,
        business_slug: business.slug,
        buyer_email: buyerEmail,
        recipient_email: recipientEmail ?? "",
      },
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: business.stripe_account_id,
        },
      },
    });

    // Optional: record a local intent (best effort)
    try {
      await recordCheckoutIntent({
        business_id: business.id,
        amount_cents: amountCents,
        buyer_email: buyerEmail,
        recipient_email: recipientEmail,
        stripe_checkout_id: session.id,
      });
    } catch (e) {
      console.warn("[checkout] recordCheckoutIntent failed:", e);
    }

    return NextResponse.json({ id: session.id, url: session.url }, { status: 200 });
  } catch (err: any) {
    const message =
      typeof err?.message === "string" ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
