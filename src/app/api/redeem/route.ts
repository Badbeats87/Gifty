// src/app/api/redeem/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  code?: string;
  business_slug?: string; // optional: ensure the code belongs to this business
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function normalizeCode(raw: string) {
  // Uppercase, remove non-alphanumerics, re-group as AAAA-BBBB-CCCC
  const upper = raw.toUpperCase();
  const alnum = upper.replace(/[^A-Z0-9]/g, "");
  const grouped = alnum.match(/.{1,4}/g)?.join("-") ?? alnum;
  return grouped;
}

export async function POST(req: NextRequest) {
  try {
    const json = (await req.json()) as Body | undefined;
    const raw = (json?.code || "").toString().trim();
    if (!raw) return bad("Missing field: code");

    const code = normalizeCode(raw);

    // Try exact match first (our webhook saves codes already formatted XXX-XXXX-XXXX)
    let { data: gift, error: selErr } = await supabaseAdmin
      .from("gift_cards")
      .select(
        "id, code, status, remaining_amount_cents, initial_amount_cents, amount_cents, currency, business_slug, buyer_email, recipient_email, stripe_checkout_id, order_id, created_at"
      )
      .eq("code", code)
      .maybeSingle();

    if (selErr) return bad(`DB error (select): ${selErr.message}`, 500);

    // If not found, try case-insensitive (defensive)
    if (!gift) {
      const { data: gift2, error: selErr2 } = await supabaseAdmin
        .from("gift_cards")
        .select(
          "id, code, status, remaining_amount_cents, initial_amount_cents, amount_cents, currency, business_slug, buyer_email, recipient_email, stripe_checkout_id, order_id, created_at"
        )
        .ilike("code", code) // case-insensitive
        .maybeSingle();

      if (selErr2) return bad(`DB error (select2): ${selErr2.message}`, 500);
      gift = gift2 ?? null;
    }

    if (!gift) {
      // Helpful hint if the code came from an older email.
      return bad(
        "Gift code not found. If this code came from an older email (before we fixed storage), please create a new test purchase and use that new code."
      );
    }

    if (json?.business_slug && gift.business_slug && gift.business_slug !== json.business_slug) {
      return bad("Gift code does not belong to this business", 403);
    }

    if (gift.status !== "issued" || (gift.remaining_amount_cents ?? 0) <= 0) {
      return bad("Gift already redeemed or has no remaining balance", 409);
    }

    // Full redemption (MVP): mark as redeemed and zero out remaining
    const { error: updErr } = await supabaseAdmin
      .from("gift_cards")
      .update({
        status: "redeemed",
        remaining_amount_cents: 0,
        // If your schema has redeemed_at, you can also set it:
        // redeemed_at: new Date().toISOString(),
      })
      .eq("id", gift.id);

    if (updErr) return bad(`DB error (update): ${updErr.message}`, 500);

    const result = {
      code: gift.code,
      currency: gift.currency ?? "usd",
      amount_cents: gift.amount_cents ?? gift.initial_amount_cents ?? 0,
      initial_amount_cents: gift.initial_amount_cents ?? gift.amount_cents ?? 0,
      remaining_amount_cents: 0,
      status: "redeemed",
      business_slug: gift.business_slug ?? null,
      buyer_email: gift.buyer_email ?? null,
      recipient_email: gift.recipient_email ?? null,
      order_id: gift.order_id ?? null,
      stripe_checkout_id: gift.stripe_checkout_id ?? null,
      created_at: gift.created_at,
    };

    return NextResponse.json({ ok: true, gift: result }, { status: 200 });
  } catch (e: any) {
    return bad(e?.message || "Unexpected error", 500);
  }
}
