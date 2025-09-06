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

  // Basic environment check
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const isHttps = window.location.protocol === "https:";
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      setSecureOk(isHttps || isLocal);
    }
  }, []);

  // List cameras (labels appear AFTER permission on many browsers)
  async function listCameras() {
    try {
      const list = await BrowserMultiFormatReader.listVideoInputDevices();
      // Deduplicate possible blanks/duplicates from some browsers
      const seen = new Set<string>();
      const deduped = list.filter((d) => {
        const key = `${d.deviceId || "unknown"}|${d.label || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setDevices(deduped);

      // Prefer rear camera when available
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
    // Stop the camera feed + ZXing when unmounting
    return () => {
      controls?.stop();
      tempStream?.getTracks()?.forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // iOS/Safari rendering quirks
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
    hints.push("Click ‘Enable camera’ to grant permission, then ‘Start scanning’. On iOS/Safari, ensure camera access is allowed for this site.");
    hints.push("Or use ‘Scan from image…’ to upload a QR screenshot/photo.");
    const msg = [
      "Unable to access the camera.",
      errMsg ? `Details: ${errMsg}` : null,
      "",
      ...hints.map((h) => `• ${h}`),
    ]
      .filter(Boolean)
      .join("\n");
    return msg;
  }

  function extractCodeFrom(text: string): string {
    // If it's a URL, pull /card/:code out of the path
    try {
      const u = new URL(text);
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "card");
      if (idx >= 0 && parts[idx + 1]) {
        return decodeURIComponent(parts[idx + 1]);
      }
    } catch {
      // not a URL
    }
    return text.trim();
  }

  // 1) Explicit permission step (user gesture)
  async function enableCamera() {
    setError(null);
    setStatus("perm");
    try {
      if (!secureOk) throw new Error("Insecure context (http). Use https:// or localhost.");

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } as any }
          : { facingMode: { ideal: "environment" } as any },
        audio: false,
      };

      // Request permission explicitly
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setPermReady(true);

      // Attach to the <video> so the user sees it (helps iOS)
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {}
      }
      setTempStream(stream);

      // Re-list cameras (labels become available after permission)
      await listCameras();
    } catch (e: any) {
      setPermReady(false);
      setError(explainPermissionIssue(e?.message || String(e)));
    }
  }

  // 2) Start ZXing decoding (now that permission is granted)
  async function start() {
    if (!deviceId || !videoRef.current) return;
    setError(null);
    setStatus("scanning");
    setScanning(true);

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
            stop(); // stop on first successful decode
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
    // Keep tempStream alive so preview remains visible; it will be stopped on unmount.
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
      if (!data.ok) throw new Error((data as any).error || "Redeem failed");
      setStatus("success");
    } catch (e: any) {
      setStatus("error");
      setError(e?.message || String(e));
    }
  }

  async function onPickImage(file: File) {
    setError(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      const text = result.getText();
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

  return (
    <div className="rounded-xl border p-4 grid gap-4">
      {/* HTTPS warning */}
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

        {/* New: explicit permission request (required for many browsers) */}
        <button
          onClick={enableCamera}
          className="px-3 py-1.5 rounded-md border"
        >
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
          <button
            onClick={stop}
            className="ml-auto px-3 py-1.5 rounded-md border"
          >
            Stop
          </button>
        )}

        {/* Image fallback */}
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
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded-md border"
        >
          Scan from image…
        </button>
      </div>

      <div className="aspect-video bg-black/5 rounded-md overflow-hidden flex items-center justify-center">
        {/* eslint-disable @next/next/no-img-element */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          autoPlay
          playsInline
        />
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
            className={`px-3 py-1.5 rounded-md border ${
              code ? "text-blue-600 hover:bg-blue-50" : "opacity-50 pointer-events-none"
            }`}
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
