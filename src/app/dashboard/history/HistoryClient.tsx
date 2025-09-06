// src/app/dashboard/history/HistoryClient.tsx
"use client";

import * as React from "react";

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
};

export default function HistoryClient({ rows }: Props) {
  const [downloading, setDownloading] = React.useState(false);

  function toCSV(rows: RedemptionRow[]): string {
    const header = [
      "redeemed_at",
      "business",
      "amount",
      "currency",
      "code",
      "redeemed_by",
    ];
    const body = rows.map((r) => {
      const redeemedAt = new Date(r.redeemedAt).toISOString();
      // keep amount as raw number to ease accounting imports
      const fields = [
        redeemedAt,
        r.businessName,
        String(r.amount ?? 0),
        r.currency,
        r.code,
        r.redeemedBy ?? "",
      ];
      // CSV-escape (double quotes around and double any internal quotes)
      return fields
        .map((f) => `"${String(f).replaceAll(`"`, `""`)}"`)
        .join(",");
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

  return (
    <div className="mt-4 flex items-center gap-2">
      <button
        onClick={handleDownload}
        className="px-3 py-1.5 rounded-md border"
        disabled={rows.length === 0 || downloading}
        title={rows.length === 0 ? "No rows to export" : "Download CSV"}
      >
        {downloading ? "Preparing…" : "Download CSV"}
      </button>
      <div className="text-xs text-gray-500">
        Exports exactly what’s shown (up to 100 most recent).
      </div>
    </div>
  );
}
