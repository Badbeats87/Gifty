// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/db";
import { sendGiftEmail } from "@/lib/email";
import type Stripe from "stripe";

export const runtime = "nodejs"; // ensure Node runtime (not edge)
export const dynamic = "force-dynamic";

function generateGiftCode(len = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0
  let raw = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) raw += alphabet[bytes[i] % alphabet.length];
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

async function recordGift(opts: {
  code: string;
  amount_cents: number;
  currency: string;
  business_id?: string | null;
  business_slug?: string | null;
  buyer_email: string;
  recipient_email?: string | null;
  stripe_checkout_id: string;
  order_id: string;
}) {
  try {
    // Only insert columns we KNOW exist in your table to avoid schema issues.
    // Your DB requires: initial_amount_cents (NOT NULL) and remaining_amount_cents (NOT NULL).
    const { error } = await supabaseAdmin.from("gift_cards").insert({
      code: opts.code,
      amount_cents: opts.amount_cents,
      initial_amount_cents: opts.amount_cents,     // satisfy NOT NULL
      remaining_amount_cents: opts.amount_cents,   // satisfy NOT NULL
      currency: opts.currency,
      business_id: opts.business_id ?? null,
      business_slug: opts.business_slug ?? null,
      buyer_email: opts.buyer_email,
      recipient_email: opts.recipient_email ?? null,
      status: "issued",
      stripe_checkout_id: opts.stripe_checkout_id,
      order_id: opts.order_id,
    } as any);
    if (error) {
      console.warn("[webhook] failed to insert gift_cards (non-fatal):", error);
    }
  } catch (e) {
    console.warn("[webhook] exception inserting gift_cards (non-fatal):", e);
  }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }
  if (!sig) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  const rawBody = await req.text();

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, secret);
  } catch (err: any) {
    console.error("[webhook] signature verification failed:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const sessionId = session.id;
      const amountTotal = session.amount_total ?? 0; // cents
      const currency = (session.currency ?? "usd").toLowerCase();

      // Prefer payment_intent id as order_id; fall back to session id
      const orderId =
        (typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as Stripe.PaymentIntent | null)?.id) ||
        sessionId;

      const md = session.metadata ?? {};
      const business_id = (md["business_id"] as string) || null;
      const business_slug = (md["business_slug"] as string) || null;
      const buyer_email = String(
        md["buyer_email"] ?? session.customer_details?.email ?? ""
      );
      const recipient_email = String(md["recipient_email"] ?? "") || null;
      const message = (md["message"] as string) || undefined;

      const business_name_guess =
        (md["business_name"] as string) ||
        (business_slug
          ? business_slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "Your Gift");

      const code = generateGiftCode();

      // Persist gift (best effort)
      await recordGift({
        code,
        amount_cents: amountTotal,
        currency,
        business_id,
        business_slug,
        buyer_email,
        recipient_email,
        stripe_checkout_id: sessionId,
        order_id: orderId,
      });

      // Email: send to recipient if provided; otherwise to buyer.
      const to = recipient_email || buyer_email;
      if (to) {
        await sendGiftEmail({
          to,
          cc: recipient_email ? [buyer_email] : undefined,
          code,
          businessName: business_name_guess,
          amountCents: amountTotal,
          currency,
          message,
        });
      } else {
        console.warn("[webhook] no email to send (missing buyer/recipient)");
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("[webhook] handler error:", err?.message || err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}
