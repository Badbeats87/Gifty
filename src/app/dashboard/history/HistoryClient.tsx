// src/app/dashboard/history/HistoryClient.tsx
"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type RedemptionRow = {
  code: string;
  redeemedAt: string; // ISO string
  redeemedBy: string | null;
  businessName: string;
  amount: number;
  currency: string;
};

type Props = {
  rows: RedemptionRow[];
  range: "7" | "30" | "90" | "all";
  initialQuery?: string;
};

export default function HistoryClient({ rows, range, initialQuery }: Props) {
  const [downloading, setDownloading] = React.useState(false);
  const [query, setQuery] = React.useState(initialQuery ?? "");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Use a fixed locale so SSR and client render the same strings
  const FIXED_LOCALE = "en-US";

  function setRange(next: "7" | "30" | "90" | "all") {
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.set("range", next);
    if (query) sp.set("q", query);
    else sp.delete("q");
    router.push(`${pathname}?${sp.toString()}`);
  }

  // Update the URL query param as you type (shareable link)
  React.useEffect(() => {
    const sp = new URLSearchParams(searchParams?.toString() || "");
    if (query) sp.set("q", query);
    else sp.delete("q");
    if (range) sp.set("range", range);
    router.replace(`${pathname}?${sp.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Filter rows by code or business
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.code.toLowerCase().includes(q) ||
        (r.businessName || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  function toCSV(data: RedemptionRow[]): string {
    const header = [
      "redeemed_at",
      "business",
      "amount",
      "currency",
      "code",
      "redeemed_by",
    ];
    const body = data.map((r) => {
      const redeemedAt = new Date(r.redeemedAt).toISOString();
      const fields = [
        redeemedAt,
        r.businessName,
        String(r.amount ?? 0),
        r.currency,
        r.code,
        r.redeemedBy ?? "",
      ];
      return fields.map((f) => `"${String(f).replaceAll(`"`, `""`)}"`).join(",");
    });
    return [header.join(","), ...body].join("\n");
  }

  async function handleDownload() {
    try {
      setDownloading(true);
      const csv = toCSV(filtered);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `gifty_redemptions_${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  // Totals by currency (deterministic formatting) — based on filtered rows
  const totals = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const prev = map.get(r.currency) ?? 0;
      map.set(r.currency, prev + (Number.isFinite(r.amount) ? r.amount : 0));
    }
    return Array.from(map.entries())
      .map(([currency, amount]) => ({
        currency,
        amount,
        formatted: new Intl.NumberFormat(FIXED_LOCALE, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(amount),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [filtered]);

  return (
    <div className="mt-4">
      {/* Filters + search + totals + export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border overflow-hidden">
          {(["7", "30", "90", "all"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setRange(opt)}
              className={`px-3 py-1.5 text-sm ${
                range === opt ? "bg-black text-white" : "bg-white"
              } ${opt !== "all" ? "border-r" : ""}`}
              aria-pressed={range === opt}
              title={opt === "all" ? "All time" : `Last ${opt} days`}
            >
              {opt === "7" ? "Last 7d" : opt === "30" ? "Last 30d" : opt === "90" ? "Last 90d" : "All time"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code or business…"
            className="border rounded-md px-3 py-1.5 text-sm min-w-[240px]"
            aria-label="Search code or business"
          />
        </div>

        <div className="text-sm text-gray-600">
          Showing{" "}
          <span className="font-medium">
            {filtered.length}
          </span>{" "}
          of {rows.length} redemption{rows.length === 1 ? "" : "s"}
          {totals.length > 0 ? (
            <>
              {" "}
              • Total{" "}
              {totals.map((t, i) => (
                <span key={t.currency}>
                  <span className="font-medium">{t.formatted}</span>{" "}
                  <span className="text-gray-400">({t.currency})</span>
                  {i < totals.length - 1 ? ", " : ""}
                </span>
              ))}
            </>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-md border"
            disabled={filtered.length === 0 || downloading}
            title={filtered.length === 0 ? "No rows to export" : "Download CSV"}
          >
            {downloading ? "Preparing…" : "Download CSV"}
          </button>
        </div>
      </div>

      {/* Table (filtered) */}
      {rows.length === 0 ? (
        <div className="mt-4 rounded-md border p-3 text-gray-600">
          No redemptions in this range.
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-md border p-3 text-gray-600">
          No matches for “{query}”.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium text-gray-600">Redeemed at</th>
                <th className="px-4 py-2 font-medium text-gray-600">Business</th>
                <th className="px-4 py-2 font-medium text-gray-600">Amount</th>
                <th className="px-4 py-2 font-medium text-gray-600">Code</th>
                <th className="px-4 py-2 font-medium text-gray-600">Redeemed by</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const amt = new Intl.NumberFormat(FIXED_LOCALE, {
                  style: "currency",
                  currency: r.currency,
                  maximumFractionDigits: 0,
                }).format(r.amount ?? 0);
                const at = new Date(r.redeemedAt).toLocaleString();
                return (
                  <tr key={`${r.code}-${r.redeemedAt}`} className="border-t">
                    <td className="px-4 py-2">{at}</td>
                    <td className="px-4 py-2">{r.businessName}</td>
                    <td className="px-4 py-2">{amt}</td>
                    <td className="px-4 py-2 font-mono">{r.code}</td>
                    <td className="px-4 py-2">{r.redeemedBy ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
