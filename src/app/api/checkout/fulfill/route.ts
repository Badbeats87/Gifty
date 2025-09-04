// src/app/api/checkout/fulfill/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendGiftEmail } from "@/lib/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil" as any,
});

// Supabase client with service role key (server-side only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    // 1. Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent", "line_items"],
    });

    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    const buyerEmail = session.customer_details?.email;
    const amountUsd = (session.amount_total ?? 0) / 100;

    // 2. Parse metadata (we could add recipientEmail / giftMessage later)
    const businessId = session.metadata?.business_id;
    const giftMessage = session.metadata?.gift_message ?? undefined;
    const recipientEmail = session.metadata?.recipient_email ?? undefined;

    if (!businessId || !buyerEmail) {
      return NextResponse.json({ error: "Missing business_id or buyer email" }, { status: 400 });
    }

    // 3. Get business info
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .single();

    if (bizErr || !business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // 4. Create gift card in DB
    const giftCardCode = `GIF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const { data: giftCard, error: gcErr } = await supabase
      .from("gift_cards")
      .insert({
        code: giftCardCode,
        business_id: business.id,
        amount: amountUsd,
        purchaser_email: buyerEmail,
      })
      .select()
      .single();

    if (gcErr || !giftCard) {
      console.error(gcErr);
      return NextResponse.json({ error: "Failed to create gift card" }, { status: 500 });
    }

    // 5. Send email(s)
    try {
      await sendGiftEmail({
        to: recipientEmail ?? buyerEmail,
        businessName: business.name,
        amountUsd,
        code: giftCardCode,
        message: giftMessage,
      });

      // Optional: send copy to buyer if different recipient
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
      console.error("Email send failed (non-fatal):", e);
    }

    return NextResponse.json({ ok: true, giftCard });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
