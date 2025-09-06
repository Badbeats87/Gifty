// src/app/api/checkout/fulfill/route.ts
import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdminClient";
import { sendGiftEmail } from "@/lib/email";
import Stripe from "stripe";

/**
 * POST /api/checkout/fulfill
 * Body: { session_id: string }
 *
 * Idempotent on session_id (one gift per checkout session).
 * Inserts WITHOUT a code (DB trigger generates it).
 * Schema-agnostic for amounts/emails/currency/business name columns.
 */

type Body = { session_id?: string };

function isMissingColumn(err: any) {
  const msg = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
  return (
    err?.code === "42703" || // undefined_column
    (msg.includes("could not find") && msg.includes("column")) ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

async function getStripe(): Promise<Stripe> {
  // Try local client first (default or named or factory)
  const candidates = ["@/lib/stripe"];
  for (const path of candidates) {
    try {
      // @ts-ignore runtime alias import
      const mod = await import(path);
      const def: any = mod?.default;
      const named: any =
        (mod as any)?.stripe ||
        (mod as any)?.client ||
        (mod as any)?.stripeClient;

      const maybe = def ?? named;
      if (maybe && typeof maybe === "object" && "checkout" in maybe) {
        return maybe as Stripe;
      }
      if (typeof def === "function") {
        const inst = def();
        if (inst && typeof (inst as any).checkout === "object") return inst as Stripe;
      }
      if (typeof named === "function") {
        const inst = named();
        if (inst && typeof (inst as any).checkout === "object") return inst as Stripe;
      }
    } catch {
      // keep trying
    }
  }
  const key =
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_API_KEY ||
    process.env.STRIPE_SECRET;
  if (!key) {
    throw new Error(
      "Stripe client unavailable and STRIPE_SECRET_KEY is not set."
    );
  }
  return new Stripe(key, {
    apiVersion: "2024-06-20",
    appInfo: { name: "Gifty", version: "1.0.0" },
  });
}

function normalizeCurrency(rowOrAny: any): string {
  const cur =
    rowOrAny?.currency ??
    rowOrAny?.currency_code ??
    rowOrAny?.curr ??
    rowOrAny?.iso_currency ??
    "USD";
  try {
    return String(cur || "USD").toUpperCase();
  } catch {
    return "USD";
  }
}

function normalizeAmount(row: any): number {
  // Prefer major unit if present
  if (typeof row?.amount === "number" && Number.isFinite(row.amount)) {
    return row.amount;
  }
  if (typeof row?.value === "number" && Number.isFinite(row.value)) {
    return row.value;
  }
  // Try common minor-unit names
  const minors = [
    "amount_minor",
    "amount_cents",
    "value_minor",
    "value_cents",
    "minor_amount",
  ];
  for (const k of minors) {
    const v = row?.[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      return Math.round(v) / 100;
    }
  }
  return 0;
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

async function tryInsertGift(
  base: Record<string, any>,
  email: string | null,
  businessNameMeta: string | null,
  currency: string,
  amountMinor: number,
  amountMajor: number
) {
  // We will try a handful of column variants until one sticks.
  const emailCols: Array<[string, any] | null> = [
    email ? ["to_email", email] : null,
    email ? ["email", email] : null,
  ];
  const bizCols: Array<[string, any] | null> = [
    businessNameMeta ? ["business_name", businessNameMeta] : null,
    businessNameMeta ? ["business", businessNameMeta] : null,
    businessNameMeta ? ["merchant_name", businessNameMeta] : null,
  ];
  const currCols: Array<[string, any]> = [
    ["currency", currency],
    ["currency_code", currency],
    ["iso_currency", currency],
    ["curr", currency],
  ];
  const amtCols: Array<[string, number]> = [
    ["amount_minor", amountMinor],
    ["value_minor", amountMinor],
    ["amount_cents", amountMinor],
    ["value_cents", amountMinor],
    ["amount", amountMajor],
    ["value", amountMajor],
  ];

  for (const e of emailCols) {
    for (const b of bizCols) {
      for (const c of currCols) {
        for (const a of amtCols) {
          const payload: any = { ...base };
          if (e) payload[e[0]] = e[1];
          if (b) payload[b[0]] = b[1];
          payload[c[0]] = c[1];
          payload[a[0]] = a[1];

          try {
            const { data, error } = await supabaseAdmin
              .from("gift_cards")
              .insert(payload)
              .select("*")
              .single();
            if (error) throw error;
            return data;
          } catch (err: any) {
            if (isMissingColumn(err)) {
              // Try next shape
              continue;
            }
            // If it's a uniqueness race on session_id or other error, bubble up
            throw err;
          }
        }
      }
    }
  }

  // Last-resort minimal payload: just session_id; DB defaults may fill rest
  const minimal: any = { ...base };
  try {
    const { data, error } = await supabaseAdmin
      .from("gift_cards")
      .insert(minimal)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    throw new Error(
      "Could not insert gift with any known column shapes. Please check your gift_cards schema."
    );
  }
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

    // Idempotency: if we already have a gift for this session, return it (no mutation)
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
        const amount = normalizeAmount(existing);
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

    // Load Stripe client and session
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product", "payment_intent"],
    });

    const currency = normalizeCurrency({ currency: session.currency });
    const amountMinor =
      (session.amount_total as number | null) ??
      (session.amount_subtotal as number | null) ??
      0;
    const amountMajor = minorToMajor(amountMinor);

    const toEmail =
      session.customer_details?.email ||
      // @ts-ignore older prop
      (session as any).customer_email ||
      (session.metadata && (session.metadata.to_email || session.metadata.email)) ||
      null;

    const meta = session.metadata || {};
    const businessId = (meta.business_id as string) || null;
    const businessNameMeta =
      (meta.business_name as string) || (meta.merchant_name as string) || null;

    // Insert WITHOUT a code, trying multiple schema shapes
    const basePayload: any = {
      session_id: session.id,
      business_id: businessId || undefined,
    };

    let row: any;
    try {
      row = await tryInsertGift(
        basePayload,
        toEmail,
        businessNameMeta,
        currency,
        amountMinor,
        amountMajor
      );
    } catch (insertErr: any) {
      // If we raced on unique(session_id), fetch the winner
      const { data: winner, error: fetchErr } = await supabaseAdmin
        .from("gift_cards")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!winner) throw insertErr;
      row = winner;
    }

    // Email the recipient with the *real* DB-generated code
    const amountForEmail = normalizeAmount(row) || amountMajor;
    const businessNameFinal =
      businessNameMeta ||
      (await findBusinessName(row.business_id)) ||
      row.business_name ||
      row.business ||
      "Business";

    const code = row.code || null;
    const link = code ? `${origin}/card/${encodeURIComponent(code)}` : undefined;

    const email = row.to_email ?? row.email ?? toEmail ?? null;
    if (email && code) {
      await sendGiftEmail(email, {
        code,
        businessName: businessNameFinal,
        amount: amountForEmail,
        currency,
        link,
      });
    }

    return NextResponse.json({
      ok: true,
      gift: {
        code,
        businessName: businessNameFinal,
        amount: amountForEmail,
        currency,
        email,
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
