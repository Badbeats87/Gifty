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

// Robust amount parser: accepts number/string (e.g., "25", "25.00", "25,00", "$25"),
// or *_cents fields (e.g., 2500).
function parseAmountUsd(body: any): number | null {
  const parseUsd = (v: any): number | null => {
    if (v == null) return null;
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") {
      // strip currency symbols/spaces, convert comma to dot
      const cleaned = v.replace(/[^\d,.\-]/g, "").replace(",", ".");
      const n = parseFloat(cleaned);
      return isFinite(n) ? n : null;
    }
    return null;
  };
  const parseCents = (v: any): number | null => {
    if (v == null) return null;
    if (typeof v === "number" && Number.isInteger(v)) return v / 100;
    if (typeof v === "string") {
      const cleaned = v.replace(/[^\d\-]/g, "");
      const n = parseInt(cleaned, 10);
      return Number.isFinite(n) ? n / 100 : null;
    }
    return null;
  };

  // Try USD fields first
  const usdCandidates = [
    body.amountUsd,
    body.amount_usd,
    body.amount,
    body.value,
    body.price,
  ];
  for (const c of usdCandidates) {
    const n = parseUsd(c);
    if (n && n > 0) return n;
  }

  // Then try cents-style fields
  const centsCandidates = [
    body.amount_cents,
    body.unitAmount,
    body.unit_amount,
    body.cents,
  ];
  for (const c of centsCandidates) {
    const n = parseCents(c);
    if (n && n > 0) return n;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Back-compat: accept id or slug, and various email/amount keys
    const business_id: string | undefined =
      body.business_id ?? body.businessId ?? undefined;
    const business_slug: string | undefined =
      body.business_slug ?? body.slug ?? undefined;

    const buyerEmail: string | undefined =
      body.buyerEmail ?? body.email ?? undefined;

    const recipientEmail: string | undefined =
      body.recipientEmail ?? body.recipient_email ?? undefined;

    const giftMessage: string | undefined =
      body.giftMessage ?? body.gift_message ?? undefined;

    // Resolve business by id or slug (both supported)
    let business: { id: string; name: string } | null = null;
    if (business_id) {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("id", business_id)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Business not found" }, { status: 404 });
      }
      business = data;
    } else if (business_slug) {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, slug")
        .eq("slug", business_slug)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Business not found" }, { status: 404 });
      }
      business = { id: data.id, name: data.name };
    } else {
      return NextResponse.json(
        { error: "Missing business identifier (business_id or slug)" },
        { status: 400 }
      );
    }

    // Parse amount (very forgiving)
    const amountUsd = parseAmountUsd(body);
    if (!amountUsd || !Number.isFinite(amountUsd) || amountUsd <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const unitAmount = Math.round(amountUsd * 100); // cents

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Create Checkout Session (email optional: Stripe will collect if not provided)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Gifty for ${business.name}`,
              metadata: { business_id: business.id },
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cancel`,
      // Fulfillment depends on these metadata keys:
      metadata: {
        business_id: business.id,
        recipient_email: recipientEmail ?? "",
        gift_message: giftMessage ?? "",
      },
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
