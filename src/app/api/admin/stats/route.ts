// src/app/api/admin/stats/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

/**
 * GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns KPIs for the admin Overview page.
 * Uses the service-role client (server-only) to bypass RLS for internal analytics.
 */

type OrderRow = {
  amount_usd?: number | null;
  amount?: number | null;
  service_fee_usd?: number | null;
  merchant_commission_usd?: number | null;
  created_at?: string | null;
};

type BusinessRow = {
  id: string;
  status?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  created_at?: string | null;
};

type GiftCardRow = {
  id: string;
  status?: string | null;
  issued_at?: string | null;
  redeemed_at?: string | null;
  created_at?: string | null;
};

function parseDateOnly(d: string | null): Date | null {
  if (!d) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(d)) return null;
  const dt = new Date(d + "T00:00:00.000Z");
  return isNaN(+dt) ? null : dt;
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}

function inRange(ts: string | null | undefined, from: Date, to: Date): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  if (isNaN(+d)) return false;
  return d >= from && d <= to;
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const range = (() => {
    const def = defaultRange();
    const fromD = parseDateOnly(fromParam);
    const toD = parseDateOnly(toParam);
    if (fromD) def.from = fromD;
    if (toD) {
      toD.setUTCHours(23, 59, 59, 999);
      def.to = toD;
    }
    return def;
  })();

  // Orders — schema-flexible fields
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("amount_usd, amount, service_fee_usd, merchant_commission_usd, created_at")
    .limit(5000);

  if (ordersErr) {
    return NextResponse.json({ error: `orders: ${ordersErr.message}` }, { status: 500 });
  }

  const filteredOrders: OrderRow[] = (orders ?? []).filter((o) =>
    inRange(o.created_at ?? null, range.from, range.to)
  );

  const grossSales = filteredOrders.reduce((sum, o) => {
    const amt = typeof o.amount_usd === "number" ? o.amount_usd : o.amount ?? 0;
    return sum + (amt ?? 0);
  }, 0);

  const serviceFees = filteredOrders.reduce(
    (sum, o) => sum + (o.service_fee_usd ?? 0),
    0
  );
  const merchantCommission = filteredOrders.reduce(
    (sum, o) => sum + (o.merchant_commission_usd ?? 0),
    0
  );
  const platformRevenue = serviceFees + merchantCommission;

  // Businesses — count "active"
  const { data: businesses, error: bizErr } = await supabase
    .from("businesses")
    .select("id, status, stripe_charges_enabled, stripe_payouts_enabled, created_at")
    .limit(5000);

  if (bizErr) {
    return NextResponse.json({ error: `businesses: ${bizErr.message}` }, { status: 500 });
  }

  const activeMerchants =
    (businesses as BusinessRow[] | null)?.filter((b) => {
      const isActiveStatus = (b.status ?? "").toLowerCase() === "active";
      const stripeReady = !!(b.stripe_charges_enabled && b.stripe_payouts_enabled);
      // if you don't track status/flags yet, treat every row as active
      if (b.status == null && b.stripe_charges_enabled == null && b.stripe_payouts_enabled == null)
        return true;
      return isActiveStatus || stripeReady;
    }).length ?? 0;

  // Gift cards — redemption rate
  const { data: giftCards, error: cardsErr } = await supabase
    .from("gift_cards")
    .select("id, status, issued_at, redeemed_at, created_at")
    .limit(8000);

  if (cardsErr) {
    return NextResponse.json({ error: `gift_cards: ${cardsErr.message}` }, { status: 500 });
  }

  const issuedInRange = (giftCards as GiftCardRow[] | null)?.filter((g) => {
    const ts = g.issued_at ?? g.created_at ?? null;
    return inRange(ts, range.from, range.to);
  }) ?? [];

  const redeemedInRange = issuedInRange.filter((g) => {
    const isRedeemedStatus = (g.status ?? "").toLowerCase() === "redeemed";
    const hasRedeemedAt = !!g.redeemed_at && inRange(g.redeemed_at, range.from, range.to);
    return isRedeemedStatus || hasRedeemedAt;
  });

  const redemptionRate =
    issuedInRange.length > 0 ? redeemedInRange.length / issuedInRange.length : 0;

  return NextResponse.json({
    period: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      params: { from: fromParam, to: toParam },
    },
    kpis: {
      grossSales,
      platformRevenue,
      activeMerchants,
      redemptionRate,
      ordersCount: filteredOrders.length,
      issuedCards: issuedInRange.length,
      redeemedCards: redeemedInRange.length,
    },
  });
}
