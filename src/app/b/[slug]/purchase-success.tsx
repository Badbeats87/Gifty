'use client';

import { useEffect, useState } from 'react';

export default function PurchaseSuccess({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<'issuing' | 'ready' | 'error'>('issuing');
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fulfill() {
      try {
        const res = await fetch('/api/checkout/fulfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const json = await res.json();

        if (cancelled) return;

        if (json.error) {
          setErr(json.error);
          setStatus('error');
          return;
        }
        if (json.not_ready) {
          // try again a few times
          if (tries < 10) {
            setTimeout(() => setTries((t) => t + 1), 1000);
            return;
          }
          setErr('Still issuing… please refresh in a moment.');
          setStatus('error');
          return;
        }
        if (json.ok || json.code || json.already) {
          setCode(json.code || null);
          setStatus('ready');
          return;
        }

        setErr('Unexpected response');
        setStatus('error');
      } catch (e: any) {
        if (!cancelled) {
          setErr(e.message || 'Failed to fulfill');
          setStatus('error');
        }
      }
    }

    fulfill();
    return () => {
      cancelled = true;
    };
    // re-run when tries increments
  }, [sessionId, tries]);

  if (status === 'issuing') {
    return <p>Issuing your gift card…</p>;
  }

  if (status === 'error') {
    return <p className="text-red-600">{err}</p>;
  }

  // ready
  return (
    <div className="rounded-md bg-white border p-3">
      <p>Your gift card is ready.</p>
      {code ? (
        <p>
          Code: <code className="font-mono">{code}</code>
        </p>
      ) : (
        <p>(Code created — reload if not visible.)</p>
      )}
      <p className="text-xs text-gray-500 mt-1">Keep this code safe. You’ll show it in person to redeem.</p>
    </div>
  );
}
