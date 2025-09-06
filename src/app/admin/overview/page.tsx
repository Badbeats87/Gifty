// src/app/admin/overview/page.tsx
import DateFilters from "./DateFilters";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

// ---------- types ----------
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

// ---------- helpers ----------
function parseDateOnly(d: string | null | undefined): Date | null {
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

function formatUSD(n: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

// ---------- server page ----------
export default async function AdminOverview({
  // Next.js 15: searchParams is async
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = getSupabaseAdmin();

  // Build date range from query (YYYY-MM-DD) or default last 30d
  const range = (() => {
    const def = defaultRange();
    const fromD = parseDateOnly(sp.from);
    const toD = parseDateOnly(sp.to);
    if (fromD) def.from = fromD;
    if (toD) {
      toD.setUTCHours(23, 59, 59, 999);
      def.to = toD;
    }
    return def;
  })();

  let error: string | null = null;

  // ---- ORDERS
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select(
      "amount_usd, amount, service_fee_usd, merchant_commission_usd, created_at"
    )
    .limit(5000);

  if (ordersErr) error = `orders: ${ordersErr.message}`;

  const filteredOrders: OrderRow[] = (orders ?? []).filter((o) =>
    inRange(o.created_at ?? null, range.from, range.to)
  );

  const grossSales = filteredOrders.reduce((sum, o) => {
    const amt =
      typeof o.amount_usd === "number"
        ? o.amount_usd
        : typeof o.amount === "number"
        ? o.amount
        : 0;
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

  // ---- BUSINESSES
  const { data: businesses, error: bizErr } = await supabase
    .from("businesses")
    .select(
      "id, status, stripe_charges_enabled, stripe_payouts_enabled, created_at"
    )
    .limit(5000);

  if (bizErr) error = error ?? `businesses: ${bizErr.message}`;

  const activeMerchants =
    (businesses as BusinessRow[] | null)?.filter((b) => {
      const isActiveStatus = (b.status ?? "").toLowerCase() === "active";
      const stripeReady = !!(b.stripe_charges_enabled && b.stripe_payouts_enabled);
      // If you don't track these columns yet, treat every row as active
      if (
        b.status == null &&
        b.stripe_charges_enabled == null &&
        b.stripe_payouts_enabled == null
      )
        return true;
      return isActiveStatus || stripeReady;
    }).length ?? 0;

  // ---- GIFT CARDS
  const { data: giftCards, error: cardsErr } = await supabase
    .from("gift_cards")
    .select("id, status, issued_at, redeemed_at, created_at")
    .limit(8000);

  if (cardsErr) error = error ?? `gift_cards: ${cardsErr.message}`;

  const issuedInRange =
    (giftCards as GiftCardRow[] | null)?.filter((g) => {
      const ts = g.issued_at ?? g.created_at ?? null;
      return inRange(ts, range.from, range.to);
    }) ?? [];

  const redeemedInRange = issuedInRange.filter((g) => {
    const isRedeemedStatus = (g.status ?? "").toLowerCase() === "redeemed";
    const hasRedeemedAt =
      !!g.redeemed_at && inRange(g.redeemed_at, range.from, range.to);
    return isRedeemedStatus || hasRedeemedAt;
  });

  const redemptionRate =
    issuedInRange.length > 0 ? redeemedInRange.length / issuedInRange.length : 0;

  const stats = {
    period: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
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
  };

  return (
    <main className="max-w-6xl mx-auto w-full px-6 py-8">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">📊 Overview</h1>

      {/* Client-side date controls */}
      <DateFilters />

      <p className="text-gray-600 mb-6">
        Period:&nbsp;
        {`${new Date(stats.period.from).toLocaleDateString()} – ${new Date(
          stats.period.to
        ).toLocaleDateString()}`}
      </p>

      {error ? (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-900 mb-8">
          Loaded with partial data. Details: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      {/* KPI Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Gross Sales</h2>
          <p className="text-2xl font-bold text-gray-900">
            {formatUSD(stats.kpis.grossSales)}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {stats.kpis.ordersCount} orders
          </p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Platform Revenue</h2>
          <p className="text-2xl font-bold text-gray-900">
            {formatUSD(stats.kpis.platformRevenue)}
          </p>
          <p className="text-xs text-gray-600 mt-1">Service fee + commission</p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Active Merchants</h2>
          <p className="text-2xl font-bold text-gray-900">
            {stats.kpis.activeMerchants}
          </p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Redemption Rate</h2>
          <p className="text-2xl font-bold text-gray-900">
            {`${Math.round(stats.kpis.redemptionRate * 100)}%`}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {`${stats.kpis.redeemedCards}/${stats.kpis.issuedCards} in period`}
          </p>
        </div>
      </section>

      {/* Recent Activity (to be wired next) */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Recent Activity</h2>
        <ul className="space-y-2">
          <li className="p-4 bg-gray-50 rounded border border-gray-200 text-gray-900">
            Coming soon — latest purchases &amp; redemptions
          </li>
        </ul>
      </section>
    </main>
  );
}
