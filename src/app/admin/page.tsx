// src/app/admin/login/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  const sp = useSearchParams();
  const next = useMemo(() => sp?.get("next") || "/admin", [sp]);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // <-- important for Set-Cookie
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        // hard navigation so middleware sees the cookie immediately
        window.location.replace(next);
      } else {
        const j = await res.json().catch(() => ({} as any));
        alert(j?.error || "Invalid token");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Admin sign-in</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Admin token</label>
          <input
            type="password"
            className="mt-1 w-full rounded border px-3 py-2"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste ADMIN_TOKEN…"
            required
            autoFocus
          />
        </div>
        <button
          className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
