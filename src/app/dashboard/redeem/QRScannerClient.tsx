// src/app/dashboard/redeem/QRScannerClient.tsx
"use client";

import * as React from "react";
import {
  BrowserMultiFormatReader,
  IScannerControls,
} from "@zxing/browser";

type RedeemResult =
  | { ok: true; redeemed?: any }
  | { ok: false; error?: string };

export default function QRScannerClient() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [controls, setControls] = React.useState<IScannerControls | null>(null);

  const [rawText, setRawText] = React.useState<string>("");
  const [code, setCode] = React.useState<string>("");
  const [status, setStatus] = React.useState<
    "idle" | "scanning" | "found" | "redeeming" | "success" | "error"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        // Prefer a rear/back camera if available
        const back =
          list.find((d) =>
            /back|rear|environment/i.test(`${d.label} ${d.deviceId}`)
          ) || list[0];
        setDeviceId(back?.deviceId || null);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    // Stop the camera feed if we leave the page/component
    return () => {
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  function extractCodeFrom(text: string): string {
    // Try to parse a full URL and extract /card/:code
    try {
      const u = new URL(text);
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "card");
      if (idx >= 0 && parts[idx + 1]) {
        return decodeURIComponent(parts[idx + 1]);
      }
    } catch {
      // not a URL — ignore
    }

    // Otherwise, return the raw text as-is (most QR codes will be the code string)
    return text.trim();
  }

  async function start() {
    if (!deviceId || !videoRef.current) return;
    setError(null);
    setStatus("scanning");
    setScanning(true);

    const reader = new BrowserMultiFormatReader();
    const nextControls = await reader.decodeFromVideoDevice(
      deviceId,
      videoRef.current,
      (result, err) => {
        if (result) {
          const text = result.getText();
          setRawText(text);
          const c = extractCodeFrom(text);
          setCode(c);
          setStatus("found");
          stop(); // stop scanning on first successful decode
        }
      }
    );
    setControls(nextControls);
  }

  function stop() {
    controls?.stop();
    setScanning(false);
    setStatus((prev) => (prev === "scanning" ? "idle" : prev));
  }

  async function redeemNow() {
    if (!code) return;
    setStatus("redeeming");
    setError(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as RedeemResult;
      if (!data.ok) {
        throw new Error(data.error || "Redeem failed");
      }
      setStatus("success");
    } catch (e: any) {
      setStatus("error");
      setError(e?.message || String(e));
    }
  }

  return (
    <div className="rounded-xl border p-4 grid gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Camera</label>
        <select
          className="border rounded-md px-2 py-1 text-sm"
          value={deviceId || ""}
          onChange={(e) => setDeviceId(e.target.value || null)}
          disabled={scanning}
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId}
            </option>
          ))}
        </select>

        {!scanning ? (
          <button
            onClick={start}
            className="ml-auto px-3 py-1.5 rounded-md bg-black text-white"
            disabled={!deviceId}
          >
            Start scanning
          </button>
        ) : (
          <button
            onClick={stop}
            className="ml-auto px-3 py-1.5 rounded-md border"
          >
            Stop
          </button>
        )}
      </div>

      <div className="aspect-video bg-black/5 rounded-md overflow-hidden flex items-center justify-center">
        {/* eslint-disable @next/next/no-img-element */}
        <video ref={videoRef} className="w-full h-full object-cover" muted />
      </div>

      <div className="grid gap-2">
        <label className="text-sm text-gray-600">Detected code (or URL)</label>
        <input
          className="border rounded-md px-3 py-2 font-mono"
          value={rawText}
          onChange={(e) => {
            const t = e.target.value;
            setRawText(t);
            setCode(extractCodeFrom(t));
          }}
          placeholder="Scan a QR or paste a code/URL"
        />
        <div className="text-sm text-gray-600">Parsed code</div>
        <div className="font-mono px-3 py-2 rounded-md bg-gray-50">{code || "—"}</div>

        <div className="flex gap-2">
          <a
            href={code ? `/card/${encodeURIComponent(code)}` : "#"}
            className={`px-3 py-1.5 rounded-md border ${code ? "text-blue-600 hover:bg-blue-50" : "opacity-50 pointer-events-none"}`}
          >
            Open card
          </a>
          <button
            onClick={redeemNow}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white disabled:opacity-50"
            disabled={!code || status === "redeeming"}
          >
            {status === "redeeming" ? "Redeeming…" : "Redeem now"}
          </button>
        </div>

        {status === "success" ? (
          <div className="text-sm rounded-md bg-emerald-50 border border-emerald-200 p-2 text-emerald-800">
            Redeemed successfully.
          </div>
        ) : null}

        {status === "error" && error ? (
          <div className="text-sm rounded-md bg-rose-50 border border-rose-200 p-2 text-rose-800">
            {error}
          </div>
        ) : null}

        {status === "scanning" ? (
          <div className="text-sm text-gray-600">Point the camera at a QR code…</div>
        ) : status === "found" ? (
          <div className="text-sm text-gray-600">Code detected. You can open or redeem.</div>
        ) : null}
      </div>
    </div>
  );
}
