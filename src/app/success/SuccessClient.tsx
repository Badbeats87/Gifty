// src/app/success/SuccessClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";

type Props = { initialSessionId?: string };

type FulfillOk = {
  ok: true;
  sent_to: string;
  gift: {
    code: string;
    amount: number;
    currency: string;
    businessName: string;
    redeemUrl: string;
  };
};
type FulfillPending = { ok: false; status: "pending"; message: string };
type FulfillMissingRecipient = {
  ok: false;
  status: "missing_recipient";
  message: string;
  gift?: any;
};
type FulfillError = { ok: false; error: string; status?: string };

function getSessionIdFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const u = new URL(window.location.href);
  return u.searchParams.get("session_id") || u.searchParams.get("sid") || undefined;
}

async function fulfillOnce(sessionId: string): Promise<
  FulfillOk | FulfillPending | FulfillMissingRecipient | FulfillError
> {
  try {
    const res = await fetch("/api/checkout/fulfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function getGiftBySession(sessionId: string) {
  const url = new URL("/api/gift/by-session", window.location.origin);
  url.searchParams.set("session_id", sessionId);
  const res = await fetch(url.toString());
  return res.json();
}

export default function SuccessClient({ initialSessionId }: Props) {
  const [sessionId, setSessionId] = React.useState<string | undefined>(initialSessionId);
  const [status, setStatus] = React.useState<
    "idle" | "sending" | "sent" | "pending" | "error" | "missing_recipient"
  >("idle");
  const [tries, setTries] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [gift, setGift] = React.useState<FulfillOk["gift"] | null>(null);

  React.useEffect(() => {
    if (!sessionId) {
      const sid = getSessionIdFromLocation();
      if (sid) setSessionId(sid);
    }
  }, [sessionId]);

  React.useEffect(() => {
    let stopped = false;

    async function run() {
      if (!sessionId) return;

      setStatus("sending");
      setError(null);
      setSentTo(null);

      const maxTries = 10;
      for (let attempt = 1; attempt <= maxTries && !stopped; attempt++) {
        setTries(attempt);

        const result = await fulfillOnce(sessionId);

        if ((result as FulfillOk).ok) {
          const ok = result as FulfillOk;
          setStatus("sent");
          setSentTo(ok.sent_to);
          setGift(ok.gift);
          return;
        }

        if ((result as FulfillMissingRecipient).status === "missing_recipient") {
          const miss = result as FulfillMissingRecipient;
          setStatus("missing_recipient");
          setError(miss.message || "Missing recipient email on gift.");
          try {
            const giftRes = await getGiftBySession(sessionId);
            if (giftRes?.ok && giftRes?.data?.code) {
              const g = giftRes.data;
              setGift({
                code: g.code,
                amount: g.amount ?? 0,
                currency: g.currency ?? "USD",
                businessName: g.businessName ?? "Business",
                redeemUrl: `${window.location.origin}/card/${encodeURIComponent(g.code)}`,
              });
            }
          } catch {}
          return;
        }

        if ((result as FulfillPending).status === "pending") {
          setStatus("pending");
          const waitMs = Math.min(5000, 500 * attempt + 500);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        const err = result as FulfillError;
        setStatus("error");
        setError(err.error || "Unknown error");
        return;
      }

      if (!stopped && status !== "sent") {
        setStatus("error");
        setError("Timed out waiting for the gift to be ready. Please try again shortly.");
      }
    }

    run();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function manualRetry() {
    if (!sessionId) {
      const sid = getSessionIdFromLocation();
      if (sid) setSessionId(sid);
      return;
    }
    setSessionId(String(sessionId));
    setStatus("idle");
    setError(null);
    setTries(0);
    setGift(null);
    setSentTo(null);
  }

  return (
    <div className="rounded-xl border p-4">
      {!sessionId ? (
        <div>
          <p className="text-red-600">Missing session id from Stripe.</p>
          <p className="text-sm text-gray-500 mt-1">
            We couldn’t identify your checkout session. Please return to the business page and try again.
          </p>
        </div>
      ) : status === "sent" && gift ? (
        <div>
          <p className="text-green-700 font-medium">Your gift has been emailed to {sentTo} ✅</p>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-4 items-center">
            <div>
              <div className="text-sm text-gray-500">Gift code</div>
              <div className="font-mono font-bold text-lg">{gift.code}</div>
              <div className="text-sm text-gray-500 mt-2">Business</div>
              <div className="font-semibold">{gift.businessName}</div>
            </div>
            <div className="text-right">
              <Link
                href={gift.redeemUrl}
                className="inline-block px-4 py-2 rounded-md bg-black text-white"
              >
                View your gift
              </Link>
            </div>
          </div>
        </div>
      ) : status === "pending" || status === "sending" || status === "idle" ? (
        <div>
          <p className="font-medium">
            {status === "sending" ? "Sending your gift..." : "Finalizing your gift..."}
          </p>
          <p className="text-sm text-gray-500 mt-1">This can take a few seconds (try {tries}/10).</p>
        </div>
      ) : status === "missing_recipient" ? (
        <div>
          <p className="text-amber-700 font-medium">We found your gift but there’s no recipient email on file.</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
          {gift?.redeemUrl ? (
            <div className="mt-3">
              <Link href={gift.redeemUrl} className="text-blue-600 underline">
                Open your gift
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <p className="text-red-600 font-medium">There was a problem sending your gift.</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
          <button
            onClick={manualRetry}
            className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md border"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
