// src/app/api/checkout/fulfill/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";
import { sendGiftEmail } from "@/lib/email";

/**
 * POST /api/checkout/fulfill
 * Body: { session_id: string }
 *
 * Behavior:
 *  - Finds the issued gift card for this Stripe Checkout session.
 *  - If found, sends the recipient an email with QR + link to the card page.
 *  - If not yet found (webhook/DB not finished), returns 202 so the client can retry shortly.
 *
 * Notes:
 *  - We intentionally DO NOT create any gift cards here. That should be done
 *    by your existing webhook / creation flow. We only send the email once the
 *    record exists.
 */

type FulfillBody = {
  session_id?: string;
};

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

// Try to locate the gift card for a given session across likely columns
async function findGiftBySession(sessionId: string) {
  // We’ll try several commonly used columns — adjust if your schema differs.
  // gift_cards likely has one of: session_id, stripe_session_id, order_id
  const ors = [
    `session_id.eq.${sessionId}`,
    `stripe_session_id.eq.${sessionId}`,
    `order_id.eq.${sessionId}`,
  ].join(",");

  const { data, error } = await supabaseAdmin
    .from("gift_cards")
    .select(
      "id, code, amount, currency, business_id, recipient_email, buyer_email, created_at"
    )
    .or(ors)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data || null;
}

async function findBusinessName(businessId: string | number | null | undefined) {
  if (!businessId && businessId !== 0) return null;
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();

  if (error) throw error;
  return data?.name ?? null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as FulfillBody;
    const url = new URL(req.url);
    const sessionId =
      body.session_id || url.searchParams.get("session_id") || "";

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing "session_id" in body or query' },
        { status: 400 }
      );
    }

    // 1) Find the issued gift card (created by your existing webhook/flow)
    const gift = await findGiftBySession(sessionId);

    if (!gift) {
      // Not ready yet — let the client poll again shortly
      return NextResponse.json(
        {
          ok: false,
          status: "pending",
          message:
            "Gift not found yet for this session. Try again in a few seconds.",
        },
        { status: 202 }
      );
    }

    const code: string = gift.code;
    const amount: number = Number(gift.amount ?? 0);
    const currency: string = (gift.currency || "USD").toUpperCase();

    // 2) Get business name
    const businessName =
      (await findBusinessName(gift.business_id)) || "Your selected business";

    // 3) Choose recipient: prefer recipient_email if present, otherwise fallback to buyer_email
    const toEmail: string | null =
      gift.recipient_email || gift.buyer_email || null;

    if (!toEmail) {
      // If no email on record, don’t fail hard — let the client handle.
      return NextResponse.json(
        {
          ok: false,
          status: "missing_recipient",
          message:
            "Gift found but no recipient/buyer email stored. Cannot send email.",
          gift: { code, amount, currency, businessName },
        },
        { status: 409 }
      );
    }

    // 4) Build redeem URL for the real card (no test params)
    const redeemUrl = `${appUrl()}/card/${encodeURIComponent(code)}`;

    // 5) Send the email (QR is embedded inside sendGiftEmail)
    const emailRes = await sendGiftEmail(toEmail, {
      code,
      amount,
      currency,
      businessName,
      redeemUrl,
      // Optional: you can enrich later (recipientName, message, etc.)
    } as any);

    return NextResponse.json({
      ok: true,
      sent_to: toEmail,
      gift: { code, amount, currency, businessName, redeemUrl },
      email_result: emailRes,
    });
  } catch (err: any) {
    console.error("[checkout/fulfill] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
