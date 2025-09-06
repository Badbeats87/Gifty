// src/app/dashboard/redeem/QRScannerClient.tsx
"use client";

import * as React from "react";
import {
  BrowserMultiFormatReader,
  IScannerControls,
} from "@zxing/browser";

type RedeemOk = {
  ok: true;
  already?: boolean;
  redeemed: {
    code: string;
    amount: number;
    currency: string;
    businessName: string;
    redeemedAt: string | null;
  };
};
type RedeemErr = { ok: false; error?: string };

export default function QRScannerClient() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState<string | null>(null);

  const [permReady, setPermReady] = React.useState(false);
  const [secureOk, setSecureOk] = React.useState(true);

  const [scanning, setScanning] = React.useState(false);
  const [controls, setControls] = React.useState<IScannerControls | null>(null);
  const [tempStream, setTempStream] = React.useState<MediaStream | null>(null);

  const [rawText, setRawText] = React.useState<string>("");
  const [code, setCode] = React.useState<string>("");

  const [status, setStatus] = React.useState<
    "idle" | "scanning" | "found" | "redeeming" | "success" | "error" | "perm"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);

  const [result, setResult] = React.useState<RedeemOk | null>(null);

  // Secure context check
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const isHttps = window.location.protocol === "https:";
      const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      setSecureOk(isHttps || isLocal);
    }
  }, []);

  async function listCameras() {
    try {
      const list = await BrowserMultiFormatReader.listVideoInputDevices();
      const seen = new Set<string>();
      const deduped = list.filter((d) => {
        const key = `${d.deviceId || "unknown"}|${d.label || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setDevices(deduped);
      const back =
        deduped.find((d) =>
          /back|rear|environment/i.test(`${d.label} ${d.deviceId}`)
        ) || deduped[0];
      setDeviceId(back?.deviceId || null);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  React.useEffect(() => {
    void listCameras();
    return () => {
      controls?.stop();
      tempStream?.getTracks()?.forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.setAttribute("playsinline", "true");
      videoRef.current.setAttribute("muted", "true");
    }
  }, []);

  function explainPermissionIssue(errMsg?: string) {
    const hints: string[] = [];
    if (!secureOk) {
      hints.push("Camera requires HTTPS (or localhost in dev). Open this page over https://");
    }
    hints.push("Click ‘Enable camera’ to grant permission, then ‘Start scanning’. On iOS/Safari, ensure camera access is allowed.");
    hints.push("Or use ‘Scan from image…’ to upload a QR screenshot/photo.");
    return ["Unable to access the camera.", errMsg ? `Details: ${errMsg}` : null, "", ...hints.map((h) => `• ${h}`)]
      .filter(Boolean)
      .join("\n");
  }

  function extractCodeFrom(text: string): string {
    try {
      const u = new URL(text);
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "card");
      if (idx >= 0 && parts[idx + 1]) {
        return decodeURIComponent(parts[idx + 1]);
      }
    } catch {}
    return text.trim();
  }

  async function enableCamera() {
    setError(null);
    setStatus("perm");
    try {
      if (!secureOk) throw new Error("Insecure context (http). Use https:// or localhost.");

      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } as any } : { facingMode: { ideal: "environment" } as any },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setPermReady(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {}
      }
      setTempStream(stream);
      await listCameras();
    } catch (e: any) {
      setPermReady(false);
      setError(explainPermissionIssue(e?.message || String(e)));
    }
  }

  async function start() {
    if (!deviceId || !videoRef.current) return;
    setError(null);
    setStatus("scanning");
    setScanning(true);
    setResult(null);

    try {
      const reader = new BrowserMultiFormatReader();
      const nextControls = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result) => {
          if (result) {
            const text = result.getText();
            setRawText(text);
            const c = extractCodeFrom(text);
            setCode(c);
            setStatus("found");
            stop();
          }
        }
      );
      setControls(nextControls);
    } catch (e: any) {
      setStatus("perm");
      setError(explainPermissionIssue(e?.message || String(e)));
      setScanning(false);
    }
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
    setResult(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as RedeemOk | RedeemErr;
      if (!data.ok) throw new Error((data as RedeemErr).error || "Redeem failed");
      setResult(data as RedeemOk);
      setStatus("success");
    } catch (e: any) {
      setStatus("error");
      setError(e?.message || String(e));
    }
  }

  async function onPickImage(file: File) {
    setError(null);
    setResult(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader();
      const decoded = await reader.decodeFromImageUrl(url);
      const text = decoded.getText();
      setRawText(text);
      const c = extractCodeFrom(text);
      setCode(c);
      setStatus("found");
    } catch (e: any) {
      setStatus("error");
      setError(`Could not read QR from image. ${e?.message || ""}`.trim());
    } finally {
      URL.revokeObjectURL(url);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const amountFmt =
    result &&
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: result.redeemed.currency || "USD",
      maximumFractionDigits: 0,
    }).format(result.redeemed.amount ?? 0);

  return (
    <div className="rounded-xl border p-4 grid gap-4">
      {!secureOk ? (
        <div className="text-sm rounded-md bg-amber-50 border border-amber-200 p-2 text-amber-800">
          This page is not using HTTPS. Camera access requires HTTPS (or localhost in dev).
          Open the site via <span className="font-mono">https://</span> to use the camera.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-600">Camera</label>
        <select
          className="border rounded-md px-2 py-1 text-sm"
          value={deviceId || ""}
          onChange={(e) => setDeviceId(e.target.value || null)}
          disabled={scanning}
        >
          {devices.length === 0 ? (
            <option key="no-devices" value="">
              No cameras found
            </option>
          ) : (
            devices.map((d, idx) => (
              <option key={`${d.deviceId || "unknown"}-${idx}`} value={d.deviceId}>
                {d.label || `Camera ${idx + 1}`}
              </option>
            ))
          )}
        </select>

        <button onClick={enableCamera} className="px-3 py-1.5 rounded-md border">
          Enable camera
        </button>

        {!scanning ? (
          <button
            onClick={start}
            className="ml-auto px-3 py-1.5 rounded-md bg-black text-white"
            disabled={!permReady || !deviceId}
            title={!permReady ? "Click ‘Enable camera’ first" : ""}
          >
            Start scanning
          </button>
        ) : (
          <button onClick={stop} className="ml-auto px-3 py-1.5 rounded-md border">
            Stop
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickImage(f);
          }}
        />
        <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 rounded-md border">
          Scan from image…
        </button>
      </div>

      <div className="aspect-video bg-black/5 rounded-md overflow-hidden flex items-center justify-center">
        {/* eslint-disable @next/next/no-img-element */}
        <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline />
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
            setResult(null);
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

        {status === "success" && result ? (
          <div className="rounded-md border p-3 bg-emerald-50 border-emerald-200 text-emerald-900">
            <div className="font-medium">
              {result.already ? "Already redeemed" : "Redeemed successfully"} ✅
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600">Business</div>
                <div className="font-semibold">{result.redeemed.businessName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Amount</div>
                <div className="font-semibold">{amountFmt}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-600">Code</div>
                <div className="font-mono">{result.redeemed.code}</div>
              </div>
            </div>
          </div>
        ) : null}

        {status === "error" && error ? (
          <div className="text-sm rounded-md bg-rose-50 border border-rose-200 p-2 text-rose-800 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        {status === "scanning" ? (
          <div className="text-sm text-gray-600">Point the camera at a QR code…</div>
        ) : status === "found" ? (
          <div className="text-sm text-gray-600">Code detected. You can open or redeem.</div>
        ) : status === "perm" && error ? (
          <div className="text-sm rounded-md bg-amber-50 border border-amber-200 p-2 text-amber-800 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
