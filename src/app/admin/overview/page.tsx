// src/app/admin/overview/page.tsx
import DateFilters from "./DateFilters";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

// ---------- helpers ----------
type AnyRow = Record<string, any>;

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

function pickTimestamp(row: AnyRow): string | null {
  return (
    row.created_at ??
    row.inserted_at ??
    row.paid_at ??
    row.timestamp ??
    row.createdAt ??
    null
  );
}

function inRange(ts: string | null | undefined, from: Date, to: Date): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  if (isNaN(+d)) return false;
  return d >= from && d <= to;
}

function toNumber(val: unknown): number | null {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (typeof val === "string") {
    const n = Number(val);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

// Heuristic: treat large integers for amount-like keys as cents.
function normalizeAmountLike(
  key: string,
  raw: number
): { value: number; centsApplied: boolean } {
  const k = key.toLowerCase();
  const looksLikeCentsKey =
    k.includes("cents") ||
    k.endsWith("_amount") ||
    k.includes("amount") ||
    k.includes("total") ||
    k.includes("fee") ||
    k.includes("commission") ||
    k.includes("application_fee");
  const isInteger = Number.isInteger(raw);
  if (looksLikeCentsKey && isInteger && Math.abs(raw) >= 1000) {
    return { value: raw / 100, centsApplied: true };
  }
  return { value: raw, centsApplied: false };
}

type PickResult = {
  value: number | null;
  key: string | null;
  centsApplied: boolean;
  raw?: number | null;
};

function pickNumberWithKey(row: AnyRow, candidates: string[]): PickResult {
  for (const key of candidates) {
    if (key in row) {
      const n = toNumber(row[key]);
      if (n !== null) {
        const norm = normalizeAmountLike(key, n);
        return { value: norm.value, key, centsApplied: norm.centsApplied, raw: n };
      }
    }
    const centsKey = key.endsWith("_cents") ? key : `${key}_cents`;
    if (centsKey in row) {
      const n = toNumber(row[centsKey]);
      if (n !== null) return { value: n / 100, key: centsKey, centsApplied: true, raw: n };
    }
  }
  return { value: null, key: null, centsApplied: false };
}

const AMOUNT_KEYS = [
  "amount_usd",
  "amount",
  "total_usd",
  "total",
  "gross_usd",
  "gross",
  "price_usd",
  "price",
  "amount_total",
  "total_amount",
  "subtotal",
  "subtotal_usd",
  "net",
  "paid_amount",
  "application_amount",
  "currency_amount",
  "amount_cents",
  "total_cents",
  "amount_paid",
  "total_amount_cents",
];

const SERVICE_FEE_KEYS = [
  "service_fee_usd",
  "service_fee",
  "fee_usd",
  "fee",
  "customer_fee_usd",
  "customer_fee",
  "platform_fee_usd",
  "platform_fee",
  "application_fee_usd",
  "application_fee",
  "application_fee_amount",
  "platform_fee_cents",
  "application_fee_cents",
];

const COMMISSION_KEYS = [
  "merchant_commission_usd",
  "merchant_commission",
  "commission_usd",
  "commission",
  "seller_fee_usd",
  "seller_fee",
];

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
  searchParams,
}: {
  // Next.js 15: searchParams is async
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

  const debug = sp.debug === "1";

  // ---- ORDERS
  const { data: orders } = await supabase.from("orders").select("*").limit(5000);
  const filteredOrders: AnyRow[] = (orders ?? []).filter((o) =>
    inRange(pickTimestamp(o), range.from, range.to)
  );

  type Trace = {
    id: string;
    ts: string | null;
    amount: number;
    amountKey: string | null;
    amountRaw: number | null | undefined;
    amountCents: boolean;
    serviceFee: number;
    serviceKey: string | null;
    serviceRaw: number | null | undefined;
    serviceCents: boolean;
    commission: number;
    commissionKey: string | null;
    commissionRaw: number | null | undefined;
    commissionCents: boolean;
    buyer?: string | null;
    recipient?: string | null;
    currency?: string | null;
    business_id?: string | null;
  };

  const traces: Trace[] = filteredOrders.map((o: AnyRow) => {
    const amt = pickNumberWithKey(o, AMOUNT_KEYS);
    const fee = pickNumberWithKey(o, SERVICE_FEE_KEYS);
    const com = pickNumberWithKey(o, COMMISSION_KEYS);
    return {
      id: String(o.id ?? o.order_id ?? o.payment_intent_id ?? o.checkout_id ?? "—"),
      ts: pickTimestamp(o),
      amount: amt.value ?? 0,
      amountKey: amt.key,
      amountRaw: amt.raw,
      amountCents: amt.centsApplied,
      serviceFee: fee.value ?? 0,
      serviceKey: fee.key,
      serviceRaw: fee.raw,
      serviceCents: fee.centsApplied,
      commission: com.value ?? 0,
      commissionKey: com.key,
      commissionRaw: com.raw,
      commissionCents: com.centsApplied,
      buyer: o.buyer_email ?? o.buyer ?? null,
      recipient: o.recipient_email ?? o.recipient ?? null,
      currency: o.currency ?? "usd",
      business_id: o.business_id ?? null,
    };
  });

  const grossSales = traces.reduce((s, t) => s + t.amount, 0);
  let serviceFees = traces.reduce((s, t) => s + t.serviceFee, 0);
  let merchantCommission = traces.reduce((s, t) => s + t.commission, 0);

  // ---- Platform revenue fallback (if no explicit fees/commissions)
  const feeBpsEnv = process.env.ADMIN_PLATFORM_FEE_BPS;
  const feeBps = feeBpsEnv ? Number(feeBpsEnv) : 0;
  const haveExplicitFees =
    serviceFees > 0 || merchantCommission > 0 || traces.some((t) => t.serviceKey || t.commissionKey);

  let platformRevenue = serviceFees + merchantCommission;
  let fallbackInfo: { applied: boolean; bps: number; computed: number } = {
    applied: false,
    bps: 0,
    computed: 0,
  };

  if (!haveExplicitFees && grossSales > 0 && feeBps > 0) {
    const computed = (grossSales * feeBps) / 10000;
    platformRevenue = computed;
    fallbackInfo = { applied: true, bps: feeBps, computed };
  }

  // ---- BUSINESSES (active count)
  const { data: businesses } = await supabase.from("businesses").select("*").limit(5000);
  const businessRows: AnyRow[] = (businesses ?? []) as AnyRow[];
  const haveStatusOrStripe =
    businessRows.some((b) => "status" in b) ||
    businessRows.some(
      (b) => "stripe_charges_enabled" in b || "stripe_payouts_enabled" in b
    );
  const activeMerchants = haveStatusOrStripe
    ? businessRows.filter((b) => {
        const isActiveStatus =
          typeof b.status === "string" && b.status.toLowerCase() === "active";
        const stripeReady = !!(b.stripe_charges_enabled && b.stripe_payouts_enabled);
        return isActiveStatus || stripeReady;
      }).length
    : businessRows.length;

  // ---- GIFT CARDS (redemption rate + activity)
  const { data: giftCards } = await supabase.from("gift_cards").select("*").limit(8000);
  const issuedInRange =
    (giftCards ?? []).filter((g: AnyRow) =>
      inRange(
        g.issued_at ?? g.created_at ?? g.purchased_at ?? g.updated_at ?? null,
        range.from,
        range.to
      )
    ) ?? [];
  const redeemedInRange = issuedInRange.filter((g: AnyRow) => {
    const status = (g.status ?? g.state ?? "").toString().toLowerCase();
    const isRedeemedStatus = status === "redeemed";
    const hasRedeemedAt =
      !!g.redeemed_at && inRange(g.redeemed_at, range.from, range.to);
    return isRedeemedStatus || hasRedeemedAt;
  });
  const redemptionRate =
    issuedInRange.length > 0 ? redeemedInRange.length / issuedInRange.length : 0;

  // ---- Activity feed (orders + redemptions) ----
  type ActivityItem =
    | {
        kind: "order";
        id: string;
        ts: Date;
        summary: string;
        sub: string;
      }
    | {
        kind: "redeem";
        id: string;
        ts: Date;
        summary: string;
        sub: string;
      };

  const orderItems: ActivityItem[] = traces
    .filter((t) => t.ts)
    .map((t) => ({
      kind: "order" as const,
      id: t.id,
      ts: new Date(t.ts as string),
      summary: `Order ${t.id.slice(0, 8)} • ${formatUSD(t.amount)}${t.currency ? ` ${String(t.currency).toUpperCase()}` : ""}`,
      sub: [t.buyer ? `Buyer: ${t.buyer}` : "", t.recipient ? `Recipient: ${t.recipient}` : ""]
        .filter(Boolean)
        .join(" • "),
    }));

  const redemptionItems: ActivityItem[] = (redeemedInRange ?? []).map((g: AnyRow) => {
    const code = g.code ? String(g.code) : String(g.id ?? "").slice(0, 8);
    const tsRaw = g.redeemed_at ?? g.updated_at ?? g.created_at ?? null;
    const ts = tsRaw ? new Date(tsRaw) : new Date();
    const who = g.recipient_email ?? g.recipient ?? null;
    return {
      kind: "redeem" as const,
      id: String(g.id ?? code),
      ts,
      summary: `Redeemed ${code}`,
      sub: who ? `Recipient: ${who}` : "",
    };
  });

  const activity: ActivityItem[] = [...orderItems, ...redemptionItems]
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    .slice(0, 20);

  const stats = {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    kpis: {
      grossSales,
      platformRevenue,
      activeMerchants,
      redemptionRate,
      ordersCount: traces.length,
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
          {fallbackInfo.applied && (
            <p className="text-xs text-gray-500 mt-1">
              Using fallback {fallbackInfo.bps} bps on gross.
            </p>
          )}
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

      {/* Debug breakdown (only if ?debug=1) */}
      {debug && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-gray-900">Debug: Orders Breakdown</h2>
          <div className="overflow-auto border border-gray-200 rounded">
            <table className="min-w-full text-sm text-gray-900">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="text-left">
                  <Th>Order ID</Th>
                  <Th>Timestamp</Th>
                  <Th>Amount → Key (raw)</Th>
                  <Th>Service Fee → Key (raw)</Th>
                  <Th>Commission → Key (raw)</Th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-gray-50">
                {traces.map((t) => (
                  <tr key={`${t.id}-${t.ts ?? "na"}`} className="hover:bg-gray-100">
                    <Td>
                      <div className="font-medium">{t.id}</div>
                      <div className="text-xs text-gray-600">
                        {t.ts ? new Date(t.ts).toLocaleString() : "—"}
                      </div>
                    </Td>
                    <Td>{t.ts ? new Date(t.ts).toLocaleString() : "—"}</Td>
                    <Td>
                      <div className="font-mono">{formatUSD(t.amount)}</div>
                      <div className="text-xs text-gray-600">
                        {t.amountKey ?? "—"}
                        {t.amountRaw != null
                          ? ` (raw=${t.amountRaw}${t.amountCents ? " cents" : ""})`
                          : ""}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-mono">{formatUSD(t.serviceFee)}</div>
                      <div className="text-xs text-gray-600">
                        {t.serviceKey ?? "—"}
                        {t.serviceRaw != null
                          ? ` (raw=${t.serviceRaw}${t.serviceCents ? " cents" : ""})`
                          : ""}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-mono">{formatUSD(t.commission)}</div>
                      <div className="text-xs text-gray-600">
                        {t.commissionKey ?? "—"}
                        {t.commissionRaw != null
                          ? ` (raw=${t.commissionRaw}${t.commissionCents ? " cents" : ""})`
                          : ""}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-600">
            Set <code>ADMIN_PLATFORM_FEE_BPS</code> in your env to enable fallback platform revenue
            when explicit fee fields are missing.
          </p>
        </section>
      )}

      {/* Recent Activity */}
      <section className="mb-16">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Recent Activity</h2>
        {activity.length === 0 ? (
          <div className="p-4 bg-gray-50 rounded border border-gray-200 text-gray-900">
            No activity in this period.
          </div>
        ) : (
          <ul className="space-y-2">
            {activity.map((it) => (
              <li
                key={`${it.kind}-${it.id}-${it.ts.getTime()}`}
                className="p-4 bg-white rounded border border-gray-200 flex items-start gap-3"
              >
                <div className="mt-0.5 text-lg" aria-hidden>
                  {it.kind === "order" ? "🧾" : "✅"}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium text-gray-900">{it.summary}</span>
                    <span className="text-xs text-gray-500">
                      {it.ts.toLocaleString()}
                    </span>
                  </div>
                  {it.sub ? (
                    <div className="text-sm text-gray-700 mt-1">{it.sub}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 border-b border-gray-200 text-xs font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 border-b border-gray-200 align-top">{children}</td>;
}
