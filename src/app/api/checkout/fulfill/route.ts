// src/app/api/checkout/fulfill/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// ──────────────────────────────────────────────────────────────
// Email setup (Resend optional; console fallback in dev)
// ──────────────────────────────────────────────────────────────
let resend: any = null;
if (process.env.RESEND_API_KEY) {
  try {
    // @ts-ignore
    const { Resend } = await import("resend");
    resend = new Resend(process.env.RESEND_API_KEY);
  } catch {
    // ignore; we'll console-log emails instead
  }
}
function getFromAddress() {
  // Use a verified sender in prod. For dev, Resend supports onboarding@resend.dev.
  // You can override via RESEND_FROM="Gifty <onboarding@resend.dev>" or your domain.
  return (
    process.env.RESEND_FROM ||
    "Gifty <onboarding@resend.dev>" // works without domain verification in dev
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fulfill a completed Checkout session by issuing a gift code.
 *
 * Accepts:
 * - GET /api/checkout/fulfill?session_id=cs_...
 * - POST { "session_id": "cs_..." }
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
    if (!session_id) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    if (!process.env.STRIPE_SECRET_KEY)
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return NextResponse.json(
        { error: "Missing Supabase env (URL or SERVICE_ROLE_KEY)" },
        { status: 500 }
      );

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" });

    // Retrieve the session; expand payment_intent to access transfer_data + metadata
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent", "line_items"],
    });

    if (session.payment_status !== "paid")
      return NextResponse.json({ error: "Session is not paid yet." }, { status: 400 });

    const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
    const pi =
      typeof session.payment_intent === "string"
        ? await stripe.paymentIntents.retrieve(session.payment_intent)
        : (session.payment_intent as Stripe.Response<Stripe.PaymentIntent> | null);

    const piMeta = ((pi?.metadata ?? {}) as Record<string, string | undefined>) || {};
    const destinationAccount =
      (pi?.transfer_data?.destination as string | undefined) ||
      meta.destinationAccount ||
      undefined;

    // --- Resolve business_id robustly ---
    const business_id =
      meta.business_id || piMeta.business_id || (await businessIdFromDestination(destinationAccount));

    if (!business_id) {
      return NextResponse.json(
        { error: "Could not resolve business for this payment (missing business_id)." },
        { status: 400 }
      );
    }

    // --- Compute gift amount (cents) robustly (gift-only) ---
    let amountCents = 0;
    if (meta.amountUsd && !Number.isNaN(Number(meta.amountUsd))) {
      amountCents = Math.round(Number(meta.amountUsd) * 100);
    } else if (meta.giftAmountCents && !Number.isNaN(Number(meta.giftAmountCents))) {
      amountCents = Math.round(Number(meta.giftAmountCents));
    } else if (typeof session.amount_subtotal === "number") {
      // Last resort; may include fee if bundled. Our checkout puts fee on top, so metadata wins above.
      amountCents = session.amount_subtotal;
    }
    if (!amountCents || amountCents <= 0)
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });

    const buyerEmail =
      meta.buyerEmail || session.customer_details?.email || piMeta.buyerEmail || "";
    const recipientEmail = meta.recipientEmail || piMeta.recipientEmail || "";

    const code = generateCode();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Base payload including commonly required columns in stricter schemas:
    // Start all tracked amounts at purchase value.
    const base = {
      code,
      business_id,
      amount_cents: amountCents,
      initial_amount_cents: amountCents,
      remaining_amount_cents: amountCents,
      balance_cents: amountCents, // optional (older schemas)
      buyer_email: buyerEmail || null,
      recipient_email: recipientEmail || null,
      currency: "USD", // optional
    } as Record<string, any>;

    // Try insert; progressively drop optional columns if Supabase says they're unknown.
    let ins = await tryInsertGift(supabase, base);

    if (ins.error && isUnknownColumnError(ins.error)) {
      // Drop balance_cents first
      const { balance_cents, ...p1 } = base;
      ins = await tryInsertGift(supabase, p1);
    }
    if (ins.error && isUnknownColumnError(ins.error)) {
      // Drop currency
      const last = (ins as any).lastTried ?? base;
      const { currency, ...p2 } = last;
      ins = await tryInsertGift(supabase, p2);
    }
    if (ins.error && isUnknownColumnError(ins.error)) {
      // Older schema might not have initial_amount_cents
      const last = (ins as any).lastTried ?? base;
      const { initial_amount_cents, ...p3 } = last;
      ins = await tryInsertGift(supabase, p3);
    }
    if (ins.error && isUnknownColumnError(ins.error)) {
      // Very old schema might not have remaining_amount_cents either
      const last = (ins as any).lastTried ?? base;
      const { remaining_amount_cents, ...p4 } = last;
      ins = await tryInsertGift(supabase, p4);
    }

    if (ins.error) {
      return NextResponse.json({ error: ins.error.message }, { status: 500 });
    }

    // Best-effort emails
    await sendEmails({
      code: ins.data.code,
      amountUsd: ins.data.amount_cents / 100,
      buyerEmail,
      recipientEmail,
    });

    return NextResponse.json(
      {
        ok: true,
        code: ins.data.code,
        amount_cents: ins.data.amount_cents,
        buyerEmail: ins.data.buyer_email,
        recipientEmail: ins.data.recipient_email,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Fulfillment failed" }, { status: 500 });
  }
}

function isUnknownColumnError(err: any) {
  const code = err?.code;
  const msg = String(err?.message || "").toLowerCase();
  // Handle multiple Supabase/PostgREST phrasings:
  // - 42703 (undefined_column)
  // - "column X does not exist"
  // - "could not find the 'X' column of 'table' in the schema cache"
  // - generic "schema cache" message variants
  return (
    code === "42703" ||
    /column .*does not exist/.test(msg) ||
    /could not find the .* column/.test(msg) ||
    /schema cache/.test(msg)
  );
}

async function tryInsertGift(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, any>
) {
  const res = await supabase
    .from("gift_cards")
    .insert(payload)
    .select("id, code, amount_cents, buyer_email, recipient_email")
    .single();
  (res as any).lastTried = payload;
  return res;
}

function generateCode() {
  const bytes = crypto.randomBytes(6);
  const base32 = bytes.toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const chunked = base32.slice(0, 12).match(/.{1,4}/g)?.join("-") || "GIF-XXXX-XXXX";
  return chunked;
}

async function businessIdFromDestination(destinationAccount?: string | null) {
  if (!destinationAccount) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const columns = [
    "stripe_account_id",
    "stripe_connect_account_id",
    "stripe_connected_account",
    "stripe_connect_id",
    "stripe_account",
  ];

  for (const col of columns) {
    const res = await supabase.from("businesses").select("id").eq(col, destinationAccount).single();
    if (!res.error && res.data?.id) return res.data.id;
    if (res.error?.code && ["42703", "PGRST116"].includes(res.error.code)) {
      continue;
    }
  }

  return null;
}

async function sendEmails({
  code,
  amountUsd,
  buyerEmail,
  recipientEmail,
}: {
  code: string;
  amountUsd: number;
  buyerEmail?: string | null;
  recipientEmail?: string | null;
}) {
  const html = emailHtml({ code, amountUsd });
  const to: string[] = [];
  if (buyerEmail) to.push(buyerEmail);
  if (recipientEmail && recipientEmail !== buyerEmail) to.push(recipientEmail);
  if (!to.length) return;

  // Prefer Resend if configured; fallback to console logging so you can see content in dev.
  if (resend) {
    try {
      const from = getFromAddress();
      await resend.emails.send({
        from,
        to,
        subject: "Your Gifty code",
        html,
      });
      // eslint-disable-next-line no-console
      console.log("[email-sent] via Resend", { from, to });
      return;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log("[email-error] Resend failed; falling back to console", e);
    }
  }

  // eslint-disable-next-line no-console
  console.log("[email-dev] (no RESEND_API_KEY) would send:", {
    to,
    from: getFromAddress(),
    subject: "Your Gifty code",
    html,
  });
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
