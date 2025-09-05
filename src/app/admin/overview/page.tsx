// src/app/admin/overview/page.tsx
import { useMemo } from "react";

// ---------- Client controls ----------
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Small client component that manipulates the URL (?from, ?to)
function DateFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [from, setFrom] = useState<string>(sp.get("from") ?? "");
  const [to, setTo] = useState<string>(sp.get("to") ?? "");

  // keep local state in sync when user navigates history
  useEffect(() => {
    setFrom(sp.get("from") ?? "");
    setTo(sp.get("to") ?? "");
  }, [sp]);

  const apply = (next: { from?: string; to?: string }) => {
    const params = new URLSearchParams(sp.toString());
    if (next.from) params.set("from", next.from);
    else params.delete("from");
    if (next.to) params.set("to", next.to);
    else params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  };

  const todayISO = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const last7 = useMemo(() => {
    const toD = new Date();
    const fromD = new Date();
    fromD.setDate(toD.getDate() - 6);
    return {
      from: fromD.toISOString().slice(0, 10),
      to: toD.toISOString().slice(0, 10),
    };
  }, []);

  const last30 = useMemo(() => {
    const toD = new Date();
    const fromD = new Date();
    fromD.setDate(toD.getDate() - 29);
    return {
      from: fromD.toISOString().slice(0, 10),
      to: toD.toISOString().slice(0, 10),
    };
  }, []);

  return (
    <section className="mb-6 flex flex-wrap items-end gap-3">
      {/* Quick presets */}
      <div className="flex gap-2">
        <button
          className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          onClick={() => apply({ from: todayISO, to: todayISO })}
        >
          Today
        </button>
        <button
          className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          onClick={() => apply(last7)}
        >
          Last 7 days
        </button>
        <button
          className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          onClick={() => apply(last30)}
        >
          Last 30 days
        </button>
      </div>

      {/* Custom range */}
      <div className="flex items-end gap-2">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1 border rounded"
          />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1 border rounded"
          />
        </label>
        <button
          className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          onClick={() => apply({ from, to })}
          disabled={!from || !to}
        >
          Apply
        </button>
        <button
          className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          onClick={() => {
            setFrom("");
            setTo("");
            const params = new URLSearchParams(sp.toString());
            params.delete("from");
            params.delete("to");
            router.push(`${pathname}?${params.toString()}`);
          }}
        >
          Clear
        </button>
      </div>
    </section>
  );
}

// ---------- Server part (runs again on URL change) ----------
/**
 * We keep the server-rendered KPIs here so they always match the
 * current ?from & ?to in the URL. The client DateFilters above
 * only updates the URL; Next.js re-renders this server component.
 */
export default async function AdminOverview({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  async function getStats(from?: string, to?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);

    // Try absolute URL if NEXT_PUBLIC_APP_URL is set
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const url = `${base}/api/admin/stats${qs.toString() ? `?${qs.toString()}` : ""}`;

    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
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

      {/* Date filtering controls */}
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
