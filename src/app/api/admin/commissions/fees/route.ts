// src/app/api/admin/commissions/fees/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(25, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)));

  // 1) list application fees on the platform
  const fees = await stripe.applicationFees.list({ limit });

  // 2) enrich with charge + (best effort) map to our gift by payment_intent (order_id)
  const results: any[] = [];
  for (const fee of fees.data) {
    const chId = (fee as any).originating_transaction as string | null;
    let piId: string | null = null;
    try {
      if (chId) {
        const ch = await stripe.charges.retrieve(chId);
        piId = (ch.payment_intent as string) || null;
      }
    } catch (_) {
      // ignore
    }

    let gift: any = null;
    if (piId) {
      const { data: gc } = await supabaseAdmin
        .from("gift_cards")
        .select("code, business_slug, buyer_email, recipient_email, amount_cents, currency, stripe_checkout_id, order_id, created_at")
        .eq("order_id", piId)
        .maybeSingle();
      gift = gc ?? null;
    }

    results.push({
      id: fee.id,
      amount: fee.amount,
      currency: fee.currency,
      created: fee.created,
      account: fee.account, // connected account (dest)
      charge: chId,
      payment_intent: piId,
      gift, // may be null if the row predates DB fixes
    });
  }

  return NextResponse.json({ fees: results });
}
