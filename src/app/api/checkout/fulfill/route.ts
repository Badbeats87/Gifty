// src/app/api/checkout/fulfill/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";
import { sendGiftEmail } from "@/lib/email";
import Stripe from "stripe";

type FulfillBody = { session_id?: string };

const CANDIDATE_COLS_SESSION = [
  "session_id",
  "stripe_session_id",
  "order_id",
  "stripe_checkout_session_id",
  "checkout_session_id",
];

const CANDIDATE_COLS_PI = [
  "payment_intent_id",
  "stripe_payment_intent_id",
  "pi_id",
  "payment_intent",
];

const EMAIL_COLS = ["recipient_email", "buyer_email", "email"];

function isMissingColumn(err: any) {
  const msg = (err?.message || "").toLowerCase();
  return err?.code === "42703" || msg.includes("does not exist");
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function normalizeCurrency(row: any): string {
  const cur =
    row?.currency ??
    row?.currency_code ??
    row?.curr ??
    row?.iso_currency ??
    "USD";
  try {
    return String(cur || "USD").toUpperCase();
  } catch {
    return "USD";
  }
}

function normalizeAmount(row: any): number {
  if (typeof row?.amount === "number" && Number.isFinite(row.amount)) {
    return row.amount;
  }
  const minorCandidates = [
    "amount_minor",
    "amount_cents",
    "value_minor",
    "value_cents",
    "minor_amount",
  ];
  for (const k of minorCandidates) {
    const v = row?.[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      return Math.round(v) / 100;
    }
  }
  if (row?.value != null) {
    const n = Number(row.value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function findByColumnProbe(
  table: string,
  cols: string[],
  value: string
): Promise<any | null> {
  for (const col of cols) {
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq(col, value)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        if (isMissingColumn(error)) continue;
        throw error;
      }
      if (data) return data;
    } catch (e: any) {
      if (isMissingColumn(e)) continue;
      throw e;
    }
  }
  return null;
}

async function findByEmailProbe(table: string, emails: string[]): Promise<any | null> {
  const clean = Array.from(new Set(emails.filter(Boolean))) as string[];
  if (clean.length === 0) return null;

  for (const emailCol of EMAIL_COLS) {
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("*")
        .in(emailCol, clean)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        if (isMissingColumn(error)) continue;
        throw error;
      }
      if (data) return data;
    } catch (e: any) {
      if (isMissingColumn(e)) continue;
      throw e;
    }
  }
  return null;
}

async function findGiftBySession(sessionId: string) {
  return findByColumnProbe("gift_cards", CANDIDATE_COLS_SESSION, sessionId);
}

async function findGiftByPaymentIntent(pi: string) {
  return findByColumnProbe("gift_cards", CANDIDATE_COLS_PI, pi);
}

async function findGiftByEmails(emails: string[]) {
  return findByEmailProbe("gift_cards", emails);
}

async function findBusinessName(businessId: string | number | null | undefined) {
  if (businessId == null) return null;
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data?.name ?? null;
}

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("[fulfill] STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(key, {
    // Keep flexible; your project may have a slightly different version
    apiVersion: "2024-06-20" as any,
  });
}

function buildTestRedeemUrl(code: string, amount: number, currency: string, businessName: string) {
  const base = `${appUrl()}/card/${encodeURIComponent(code)}`;
  const params = new URLSearchParams({
    test: "1",
    amt: String(amount),
    cur: currency,
    biz: businessName,
  });
  return `${base}?${params.toString()}`;
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

    // 1) Try to find the real gift by a "session" column
    let gift = await findGiftBySession(sessionId);

    // 2) If not found, fetch the Stripe session and probe via payment_intent / emails
    let session: Stripe.Checkout.Session | null = null;
    if (!gift) {
      try {
        const stripe = stripeClient();
        session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["payment_intent", "customer"],
        });
      } catch (e) {
        console.warn("[fulfill] Unable to retrieve Stripe session", e);
      }
    }

    if (!gift && session) {
      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (pi) {
        gift = await findGiftByPaymentIntent(pi);
      }
    }

    if (!gift && session) {
      const emails = [
        session.customer_details?.email || "",
        (session.customer as Stripe.Customer | null)?.email || "",
        session.customer_email || "",
        session.metadata?.recipient_email || "",
        session.metadata?.buyer_email || "",
      ].filter(Boolean) as string[];

      if (emails.length > 0) {
        gift = await findGiftByEmails(emails);
      }
    }

    // 3) If still no gift found…
    if (!gift) {
      // If we have no Stripe session or it's not completed/paid, ask caller to retry later.
      if (!session || !["complete"].includes(String(session.status))) {
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

      // We DO have a completed Stripe session: send a temporary "test fallback" email
      const toEmail =
        session.customer_details?.email ||
        (session.customer as Stripe.Customer | null)?.email ||
        session.customer_email ||
        session.metadata?.recipient_email ||
        session.metadata?.buyer_email ||
        "";

      if (!toEmail) {
        return NextResponse.json(
          {
            ok: false,
            status: "missing_recipient",
            message:
              "Payment complete, but no recipient/buyer email available from Stripe session.",
          },
          { status: 409 }
        );
      }

      const amount =
        typeof session.amount_total === "number"
          ? Math.round(session.amount_total) / 100
          : 0;
      const currency = (session.currency || "USD").toUpperCase();
      const businessName =
        session.metadata?.business_name ||
        session.metadata?.business ||
        "Selected business";

      // Temporary code derived from session id (avoids clashing with real codes)
      const code = `TMP-${session.id.slice(-8).toUpperCase()}`;

      const redeemUrl = buildTestRedeemUrl(code, amount, currency, businessName);

      const emailRes = await sendGiftEmail(toEmail, {
        code,
        amount,
        currency,
        businessName,
        redeemUrl,
      } as any);

      return NextResponse.json({
        ok: true,
        mode: "fallback_session_only",
        sent_to: toEmail,
        gift: { code, amount, currency, businessName, redeemUrl },
        email_result: emailRes,
      });
    }

    // 4) Real gift found — send the real email
    const code: string = gift.code;
    const amount: number = normalizeAmount(gift);
    const currency: string = normalizeCurrency(gift);
    const businessName =
      (await findBusinessName(gift.business_id)) || "Your selected business";

    const toEmail: string | null =
      gift.recipient_email || gift.buyer_email || gift.email || null;

    if (!toEmail) {
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

    const redeemUrl = `${appUrl()}/card/${encodeURIComponent(code)}`;

    const emailRes = await sendGiftEmail(toEmail, {
      code,
      amount,
      currency,
      businessName,
      redeemUrl,
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
