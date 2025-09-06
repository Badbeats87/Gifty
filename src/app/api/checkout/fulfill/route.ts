// src/app/api/checkout/fulfill/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";
import { sendGiftEmail } from "@/lib/email";
import Stripe from "stripe";

/**
 * POST /api/checkout/fulfill
 * Body: { session_id: string }
 *
 * Idempotent on session_id:
 *  - If a gift already exists for this session_id, return it (no mutation).
 *  - Else, fetch Stripe Checkout Session, insert a new gift_cards row WITHOUT a code
 *    (DB trigger generates it), then email the recipient with the real code.
 *
 * Also: robust Stripe client loader (handles various export styles or falls back to env).
 */

type Body = { session_id?: string };

async function getStripe(): Promise<Stripe> {
  // Try your local module first, supporting default or named exports.
  const candidates = ["@/lib/stripe"];
  for (const path of candidates) {
    try {
      // @ts-ignore dynamic alias import at runtime
      const mod = await import(path);
      const def: any = mod?.default;
      const named: any = (mod as any)?.stripe || (mod as any)?.client || (mod as any)?.stripeClient;

      const maybe = def ?? named;
      if (maybe && typeof maybe === "object" && "checkout" in maybe) {
        return maybe as Stripe;
      }
      // Some repos export a factory: () => new Stripe(...)
      if (typeof def === "function") {
        const inst = def();
        if (inst && typeof (inst as any).checkout === "object") return inst as Stripe;
      }
      if (typeof named === "function") {
        const inst = named();
        if (inst && typeof (inst as any).checkout === "object") return inst as Stripe;
      }
    } catch {
      // try next
    }
  }

  // Fall back to env var
  const key =
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_API_KEY ||
    process.env.STRIPE_SECRET;
  if (!key) {
    throw new Error(
      "Stripe client unavailable and STRIPE_SECRET_KEY is not set. Set STRIPE_SECRET_KEY (server) or export a client from '@/lib/stripe'."
    );
  }
  return new Stripe(key, {
    apiVersion: "2024-06-20",
    appInfo: { name: "Gifty", version: "1.0.0" },
  });
}

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

    // 0) Idempotency: already fulfilled?
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
          already: true,
          gift: {
            code: existing.code || null,
            businessName,
            amount,
            currency,
            email: existing.to_email ?? existing.email ?? null,
            sessionId,
          },
        });
      }
    }

    // 1) Load Stripe client robustly
    const stripe = await getStripe();

    // 2) Retrieve the Checkout Session details
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product", "payment_intent"],
    });

    const currency = normalizeCurrency({ currency: session.currency });
    const amountMinor =
      (session.amount_total as number | null) ??
      (session.amount_subtotal as number | null) ??
      0;

    const toEmail =
      session.customer_details?.email ||
      // @ts-ignore older property
      (session as any).customer_email ||
      (session.metadata && (session.metadata.to_email || session.metadata.email)) ||
      null;

    const meta = session.metadata || {};
    const businessId = (meta.business_id as string) || null;
    const businessNameMeta =
      (meta.business_name as string) || (meta.merchant_name as string) || null;

    // 3) Insert a brand-new gift row — DO NOT set "code"; DB trigger generates it
    const insertPayload: any = {
      session_id: session.id,
      to_email: toEmail,
      business_id: businessId,
      business_name: businessNameMeta,
      amount_minor: amountMinor,
      currency, // keep uppercase
    };

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("gift_cards")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertErr) {
      // Race on unique(session_id) -> fetch winner
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
        already: true,
        gift: {
          code: winner.code || null,
          businessName: businessName2,
          amount: amount2,
          currency: currency2,
          email: winner.to_email ?? winner.email ?? null,
          sessionId,
        },
      });
    }

    // 4) Email recipient with the real DB-generated code
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
