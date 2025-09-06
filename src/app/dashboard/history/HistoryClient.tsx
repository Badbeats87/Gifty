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
};

export default function HistoryClient({ rows, range }: Props) {
  const [downloading, setDownloading] = React.useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setRange(next: "7" | "30" | "90" | "all") {
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.set("range", next);
    router.push(`${pathname}?${sp.toString()}`);
  }

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
      const csv = toCSV(rows);
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

  // Totals by currency
  const totals = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const prev = map.get(r.currency) ?? 0;
      map.set(r.currency, prev + (Number.isFinite(r.amount) ? r.amount : 0));
    }
    return Array.from(map.entries())
      .map(([currency, amount]) => ({
        currency,
        amount,
        formatted: new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(amount),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [rows]);

  return (
    <>
      {/* Filters + totals + export */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border overflow-hidden">
          {(["7", "30", "90", "all"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setRange(opt)}
              className={`px-3 py-1.5 text-sm ${
                range === opt ? "bg-black text-white" : "bg-white"
              } ${opt !== "all" ? "border-r" : ""}`}
              aria-pressed={range === opt}
              title={
                opt === "all"
                  ? "All time"
                  : `Last ${opt} day${opt === "1" ? "" : "s"}`
              }
            >
              {opt === "7" ? "Last 7d" : opt === "30" ? "Last 30d" : opt === "90" ? "Last 90d" : "All time"}
            </button>
          ))}
        </div>

        <div className="text-sm text-gray-600">
          Showing <span className="font-medium">{rows.length}</span>{" "}
          redemption{rows.length === 1 ? "" : "s"}
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
            disabled={rows.length === 0 || downloading}
            title={rows.length === 0 ? "No rows to export" : "Download CSV"}
          >
            {downloading ? "Preparing…" : "Download CSV"}
          </button>
        </div>
      </div>
    </>
  );
}
