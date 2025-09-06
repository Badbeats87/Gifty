// src/app/api/checkout/fulfill/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";
import { sendGiftEmail } from "@/lib/email";

type FulfillBody = { session_id?: string };

const CANDIDATE_COLS = [
  "session_id",
  "stripe_session_id",
  "order_id",
  "stripe_checkout_session_id",
  "checkout_session_id",
];

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

async function findGiftBySession(sessionId: string) {
  for (const col of CANDIDATE_COLS) {
    try {
      const { data, error } = await supabaseAdmin
        .from("gift_cards")
        .select("*")
        .eq(col, sessionId)
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

    const gift = await findGiftBySession(sessionId);

    if (!gift) {
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
