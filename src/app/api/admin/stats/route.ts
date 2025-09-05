// src/app/api/admin/stats/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/src/lib/supabaseServer";

/**
 * GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns basic KPIs for the admin Overview page.
 * - GrossSales: SUM(orders.amount_usd)
 * - PlatformRevenue: SUM(service_fee_usd) + SUM(merchant_commission_usd)
 * - ActiveMerchants: COUNT(businesses) with status='active' OR payouts/charges enabled
 * - RedemptionRate: redeemed_cards / issued_cards in period
 *
 * Notes:
 * - Defensive: columns may not all exist yet; nulls are fine.
 * - Period defaults to the *last 30 days* if not specified.
 * - This is internal-only in spirit; currently public per your request.
 */

type OrderRow = {
  amount_usd: number | null;
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
  status?: string | null; // "issued" | "redeemed" | "voided" (if used)
  issued_at?: string | null;
  redeemed_at?: string | null;
  created_at?: string | null; // fallback if issued_at not present
};

function parseDateOnly(d: string | null): Date | null {
  if (!d) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(d)) return null;
  try {
    const dt = new Date(d + "T00:00:00.000Z");
    return isNaN(+dt) ? null : dt;
  } catch {
    return null;
  }
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  // normalize to UTC midnight bounds
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
  const supabase = getSupabaseServer();

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

  // --- Orders: compute GrossSales & PlatformRevenue
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("amount_usd, service_fee_usd, merchant_commission_usd, created_at")
    .order("created_at", { ascending: false })
    .limit(2000); // MVP cap; adjust later

  if (ordersErr) {
    return NextResponse.json(
      { error: `orders: ${ordersErr.message}` },
      { status: 500 }
    );
  }

  const filteredOrders: OrderRow[] = (orders ?? []).filter((o) =>
    inRange(o.created_at ?? null, range.from, range.to)
  );

  const grossSales = filteredOrders.reduce(
    (sum, o) => sum + (o.amount_usd ?? 0),
    0
  );
  const serviceFees = filteredOrders.reduce(
    (sum, o) => sum + (o.service_fee_usd ?? 0),
    0
  );
  const merchantCommission = filteredOrders.reduce(
    (sum, o) => sum + (o.merchant_commission_usd ?? 0),
    0
  );
  const platformRevenue = serviceFees + merchantCommission;

  // --- Businesses: ActiveMerchants
  const { data: businesses, error: bizErr } = await supabase
    .from("businesses")
    .select(
      "id, status, stripe_charges_enabled, stripe_payouts_enabled, created_at"
    )
    .limit(2000);

  if (bizErr) {
    return NextResponse.json(
      { error: `businesses: ${bizErr.message}` },
      { status: 500 }
    );
  }

  const activeMerchants = (businesses as BusinessRow[] | null)?.filter((b) => {
    const isActiveStatus = (b.status ?? "").toLowerCase() === "active";
    const stripeReady = !!(b.stripe_charges_enabled && b.stripe_payouts_enabled);
    return isActiveStatus || stripeReady;
  }).length ?? 0;

  // --- Gift cards: RedemptionRate
  const { data: giftCards, error: cardsErr } = await supabase
    .from("gift_cards")
    .select("id, status, issued_at, redeemed_at, created_at")
    .limit(5000);

  if (cardsErr) {
    return NextResponse.json(
      { error: `gift_cards: ${cardsErr.message}` },
      { status: 500 }
    );
  }

  const issuedInRange = (giftCards as GiftCardRow[] | null)?.filter((g) => {
    // Prefer issued_at; fallback to created_at if not present
    const ts = g.issued_at ?? g.created_at ?? null;
    return inRange(ts, range.from, range.to);
  }) ?? [];

  const redeemedInRange = issuedInRange.filter((g) => {
    // If status is tracked, prefer it; else use redeemed_at timestamp
    const isRedeemedStatus = (g.status ?? "").toLowerCase() === "redeemed";
    const hasRedeemedAt = !!g.redeemed_at && inRange(g.redeemed_at, range.from, range.to);
    return isRedeemedStatus || hasRedeemedAt;
  });

  const redemptionRate =
    issuedInRange.length > 0
      ? redeemedInRange.length / issuedInRange.length
      : 0;

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
      redemptionRate, // 0..1
      ordersCount: filteredOrders.length,
      issuedCards: issuedInRange.length,
      redeemedCards: redeemedInRange.length,
    },
  });
}
