// src/app/api/checkout/fulfill/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";
import stripeClient from "@/lib/stripe";
import { sendGiftEmail } from "@/lib/email";

/**
 * POST /api/checkout/fulfill
 * Body: { session_id: string }
 *
 * Idempotent on session_id:
 *  - If a gift already exists for this session_id, return it (do not mutate the row).
 *  - Else, fetch Stripe Checkout Session, insert a new gift_cards row WITHOUT a code
 *    (DB trigger generates it), then email the recipient with the real code.
 *
 * Assumes you have:
 *  - DB trigger to always set gift_cards.code on INSERT
 *  - UNIQUE INDEX on gift_cards(session_id) WHERE session_id IS NOT NULL
 */

type Body = { session_id?: string };

function normalizeCurrency(rowOrCode: any): string {
  const cur =
    rowOrCode?.currency ??
    rowOrCode?.currency_code ??
    rowOrCode?.curr ??
    rowOrCode?.iso_currency ??
    "USD";
  try {
    return String(cur || "USD").toUpperCase();
  } catch {
    return "USD";
  }
}

function minorToMajor(minor?: number | null): number {
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

async function findBusinessName(businessId: any) {
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
    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const body = (await req.json().catch(() => ({}))) as Body;
    const sessionId = (body.session_id || "").trim();
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing "session_id" in request body' },
        { status: 400 }
      );
    }

    // 0) Idempotency: if we already have a gift for this session, return it.
    {
      const { data: existing, error } = await supabaseAdmin
        .from("gift_cards")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (existing) {
        const currency = normalizeCurrency(existing);
        const amount = existing.amount ?? minorToMajor(existing.amount_minor);
        const businessName =
          (await findBusinessName(existing.business_id)) ||
          existing.business_name ||
          existing.business ||
          "Business";

        return NextResponse.json({
          ok: true,
          gift: {
            code: existing.code || null, // <-- whatever is in the DB
            businessName,
            amount,
            currency,
            email: existing.to_email ?? existing.email ?? null,
            sessionId,
          },
          already: true,
        });
      }
    }

    // 1) Retrieve the Stripe Checkout Session for details
    const session = await stripeClient.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product", "payment_intent"],
    });

    const currency = normalizeCurrency({ currency: session.currency });
    const amountMinor =
      (session.amount_total as number | null) ??
      (session.amount_subtotal as number | null) ??
      0;

    const toEmail =
      session.customer_details?.email ||
      (session as any).customer_email ||
      (session.metadata && (session.metadata.to_email || session.metadata.email)) ||
      null;

    // Prefer explicit business metadata when present; fall back to names on the product
    const meta = session.metadata || {};
    const businessId = (meta.business_id as string) || null;
    const businessNameMeta =
      (meta.business_name as string) || (meta.merchant_name as string) || null;

    // 2) Insert a brand-new gift row. DO NOT send a "code" — let the DB trigger generate it.
    const insertPayload: any = {
      session_id: session.id,
      to_email: toEmail,
      business_id: businessId,
      business_name: businessNameMeta,
      amount_minor: amountMinor,
      currency, // keep uppercase for consistency
    };

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("gift_cards")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertErr) {
      // If we somehow raced and the unique(session_id) fired, fetch the winner
      const { data: winner, error: fetchErr } = await supabaseAdmin
        .from("gift_cards")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!winner) throw insertErr;

      const currency2 = normalizeCurrency(winner);
      const amount2 = winner.amount ?? minorToMajor(winner.amount_minor);
      const businessName2 =
        (await findBusinessName(winner.business_id)) ||
        winner.business_name ||
        winner.business ||
        "Business";

      return NextResponse.json({
        ok: true,
        gift: {
          code: winner.code || null,
          businessName: businessName2,
          amount: amount2,
          currency: currency2,
          email: winner.to_email ?? winner.email ?? null,
          sessionId,
        },
        already: true,
      });
    }

    // 3) Email the recipient with the *real* DB-generated code
    const amountMajor = row.amount ?? minorToMajor(row.amount_minor);
    const businessNameFinal =
      businessNameMeta ||
      (await findBusinessName(row.business_id)) ||
      row.business ||
      "Business";

    const link = row.code ? `${origin}/card/${encodeURIComponent(row.code)}` : undefined;

    if (toEmail && row.code) {
      await sendGiftEmail(toEmail, {
        code: row.code,
        businessName: businessNameFinal,
        amount: amountMajor,
        currency,
        link,
      });
    }

    return NextResponse.json({
      ok: true,
      gift: {
        code: row.code || null,
        businessName: businessNameFinal,
        amount: amountMajor,
        currency,
        email: toEmail,
        sessionId,
      },
    });
  } catch (err: any) {
    console.error("[checkout/fulfill] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
