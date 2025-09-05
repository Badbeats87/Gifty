// src/app/api/checkout/fulfill/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Optional email via Resend. If RESEND_API_KEY is missing or sending fails, we won't crash.
let resend: any = null;
if (process.env.RESEND_API_KEY) {
  try {
    // Dynamically import to avoid hard dependency if you don't configure Resend yet.
    // @ts-ignore
    const { Resend } = await import("resend");
    resend = new Resend(process.env.RESEND_API_KEY);
  } catch {
    // ignore
  }
}

/**
 * Fulfill a completed Checkout session by issuing a gift code.
 *
 * This endpoint accepts:
 * - GET /api/checkout/fulfill?session_id=cs_test_...
 * - POST { "session_id": "cs_test_..." }
 *
 * It retrieves the session from Stripe, reads metadata (business_id, amountUsd, buyerEmail, recipientEmail),
 * creates a gift record in Supabase, and returns the code and amount.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const session_id = searchParams.get("session_id");
  return fulfill(session_id);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const session_id = body.session_id ?? body.sessionId ?? null;
  return fulfill(session_id);
}

async function fulfill(session_id: string | null) {
  try {
    if (!session_id) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing Supabase env (URL or SERVICE_ROLE_KEY)" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve the session; expand line_items as a fallback source of truth
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items"],
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Session is not paid yet." },
        { status: 400 }
      );
    }

    // Prefer explicit metadata from checkout creation
    const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
    const business_id = meta.business_id ?? "";
    const buyerEmail = meta.buyerEmail ?? session.customer_details?.email ?? "";
    const recipientEmail = meta.recipientEmail ?? "";

    // Compute amount (in cents) robustly:
    // 1) metadata.amountUsd
    // 2) sum of line_items amounts
    // 3) fallback: session.amount_subtotal (should be gift amount if only one item)
    let amountCents = 0;

    if (meta.amountUsd && !Number.isNaN(Number(meta.amountUsd))) {
      amountCents = Math.round(Number(meta.amountUsd) * 100);
    } else if (session?.line_items?.data?.length) {
      amountCents = session.line_items.data.reduce((sum, li) => {
        // @ts-ignore unit_amount is available on price_data or price
        const unit = li.price?.unit_amount ?? li.price_data?.unit_amount ?? 0;
        const qty = li.quantity ?? 1;
        return sum + Number(unit || 0) * Number(qty || 1);
      }, 0);
    } else if (typeof session.amount_subtotal === "number") {
      amountCents = session.amount_subtotal;
    }

    if (!business_id || !amountCents || amountCents <= 0) {
      return NextResponse.json(
        { error: "Missing/invalid business_id or amount." },
        { status: 400 }
      );
    }

    // Generate a simple human-friendly code like ABCD-EFGH-IJKL
    const code = generateCode();

    // Insert gift into Supabase using service role (bypasses RLS, safe for server)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Try common column names; adjust to your schema as needed
    const payload: Record<string, any> = {
      code,
      amount_cents: amountCents,
      buyer_email: buyerEmail || null,
      recipient_email: recipientEmail || null,
      stripe_session_id: session_id,
      // common patterns:
      business_id, // if column exists
    };

    // Insert and re-select to return user-friendly fields
    const { data: gift, error: insertErr } = await supabase
      .from("gift_cards")
      .insert(payload)
      .select("id, code, amount_cents, buyer_email, recipient_email")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Try sending emails, but don't fail the response if it errors
    if (resend) {
      const toBuyer: string[] = [];
      if (buyerEmail) toBuyer.push(buyerEmail);
      if (recipientEmail && recipientEmail !== buyerEmail) {
        toBuyer.push(recipientEmail);
      }
      if (toBuyer.length) {
        try {
          await resend.emails.send({
            from: "Gifty <no-reply@gifty.local>",
            to: toBuyer,
            subject: "Your Gifty code",
            html: emailHtml({
              code: gift!.code,
              amountUsd: gift!.amount_cents / 100,
            }),
          });
        } catch {
          // ignore email errors in dev
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        code: gift!.code,
        amount_cents: gift!.amount_cents,
        buyerEmail: gift!.buyer_email,
        recipientEmail: gift!.recipient_email,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Fulfillment failed" },
      { status: 500 }
    );
  }
}

function generateCode() {
  const bytes = crypto.randomBytes(6); // 12 hex chars ~ 48 bits
  const base32 = bytes.toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const chunked = base32.slice(0, 12).match(/.{1,4}/g)?.join("-") || "GIF-XXXX-XXXX";
  return chunked;
}

function emailHtml({ code, amountUsd }: { code: string; amountUsd: number }) {
  return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height:1.5;">
    <h2>🎁 Your Gifty is ready!</h2>
    <p>Amount: <strong>$${amountUsd.toFixed(2)}</strong></p>
    <p>Code: <strong style="letter-spacing:1px;">${code}</strong></p>
    <p>Show this code at the partner business to redeem.</p>
    <hr />
    <p style="color:#666">Thanks for using Gifty.</p>
  </div>
  `.trim();
}
