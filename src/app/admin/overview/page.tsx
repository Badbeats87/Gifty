// src/app/admin/overview/page.tsx
import DateFilters from "./DateFilters";

async function getStats(from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const absUrl = `${base}/api/admin/stats${qs.toString() ? `?${qs.toString()}` : ""}`;

  // Try absolute (works in prod), fallback to relative (works in dev)
  const res = await fetch(absUrl, { cache: "no-store" }).catch(() => null);
  const ok =
    res && res.ok
      ? res
      : await fetch(`/api/admin/stats${qs.toString() ? `?${qs.toString()}` : ""}`, {
          cache: "no-store",
        });

  if (!ok.ok) {
    const text = await ok.text().catch(() => "");
    throw new Error(`Failed to load stats: ${ok.status} ${text}`);
  }
  return ok.json() as Promise<{
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
  }>;
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
  searchParams: { from?: string; to?: string };
}) {
  let stats: Awaited<ReturnType<typeof getStats>> | null = null;
  let error: string | null = null;
  try {
    stats = await getStats(searchParams.from, searchParams.to);
  } catch (e: any) {
    error = e?.message ?? "Unknown error";
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-2">📊 Overview</h1>

      {/* Client date controls */}
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
          <h2 className="text-lg font-semibold mb-2">Gross Sales</h2>
          <p className="text-2xl font-bold">
            {stats ? formatUSD(stats.kpis.grossSales) : "—"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats ? `${stats.kpis.ordersCount} orders` : "—"}
          </p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Platform Revenue</h2>
          <p className="text-2xl font-bold">
            {stats ? formatUSD(stats.kpis.platformRevenue) : "—"}
          </p>
          <p className="text-xs text-gray-500 mt-1">Service fee + commission</p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Active Merchants</h2>
          <p className="text-2xl font-bold">
            {stats ? stats.kpis.activeMerchants : "—"}
          </p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Redemption Rate</h2>
          <p className="text-2xl font-bold">
            {stats ? `${Math.round(stats.kpis.redemptionRate * 100)}%` : "—"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats
              ? `${stats.kpis.redeemedCards}/${stats.kpis.issuedCards} in period`
              : "—"}
          </p>
        </div>
      </section>

      {/* Recent Activity (to be wired later) */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <ul className="space-y-2">
          <li className="p-4 bg-gray-50 rounded border">
            Coming soon — latest purchases & redemptions
          </li>
        </ul>
      </section>
    </main>
  );
}
