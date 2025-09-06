// src/app/admin/overview/DateFilters.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Client-only date filter controls that update the URL (?from, ?to).
 * Server page re-renders automatically when the URL changes.
 */
export default function DateFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [from, setFrom] = useState<string>(sp.get("from") ?? "");
  const [to, setTo] = useState<string>(sp.get("to") ?? "");

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
