// src/app/admin/overview/page.tsx
import { headers } from "next/headers";
import DateFilters from "./DateFilters";

/** Build absolute origin from the current request (works in dev/prod). */
function getOrigin() {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, "");
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function getStats(origin: string, from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const url = `${origin}/api/admin/stats${qs.toString() ? `?${qs.toString()}` : ""}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load stats: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    period: { from: string; to: string };
    kpis: {
      grossSales: number;
      platformRevenue: number;
      activeMerchants: number;
      redemptionRate: number;
      ordersCount: number;
      issuedCards: number;
      redeemedCards: number;
    };
  };
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

export default async function AdminOverview({
  searchParams,
}: {
  // Next.js 15: searchParams is async
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const origin = getOrigin();

  let stats: Awaited<ReturnType<typeof getStats>> | null = null;
  let error: string | null = null;

  try {
    stats = await getStats(origin, sp.from, sp.to);
  } catch (e: any) {
    error = e?.message ?? "Unknown error";
  }

  return (
    <main className="max-w-6xl mx-auto w-full px-6 py-8">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">📊 Overview</h1>

      {/* Client-side date controls */}
      <DateFilters />

      <p className="text-gray-600 mb-6">
        Period:&nbsp;
        {stats
          ? `${new Date(stats.period.from).toLocaleDateString()} – ${new Date(
              stats.period.to
            ).toLocaleDateString()}`
          : "—"}
      </p>

      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800 mb-8">
          {error}
        </div>
      ) : null}

      {/* KPI Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Gross Sales</h2>
          <p className="text-2xl font-bold text-gray-900">
            {stats ? formatUSD(stats.kpis.grossSales) : "—"}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {stats ? `${stats.kpis.ordersCount} orders` : "—"}
          </p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Platform Revenue</h2>
          <p className="text-2xl font-bold text-gray-900">
            {stats ? formatUSD(stats.kpis.platformRevenue) : "—"}
          </p>
          <p className="text-xs text-gray-600 mt-1">Service fee + commission</p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Active Merchants</h2>
          <p className="text-2xl font-bold text-gray-900">
            {stats ? stats.kpis.activeMerchants : "—"}
          </p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Redemption Rate</h2>
          <p className="text-2xl font-bold text-gray-900">
            {stats ? `${Math.round(stats.kpis.redemptionRate * 100)}%` : "—"}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {stats
              ? `${stats.kpis.redeemedCards}/${stats.kpis.issuedCards} in period`
              : "—"}
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
