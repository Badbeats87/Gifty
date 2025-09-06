// src/app/api/test-send-gift/route.ts
import { NextResponse } from "next/server";
import { sendGiftEmail } from "../../../lib/email";

type Payload = {
  to: string;
  code: string;
  amount: number;
  currency: string;
  businessName: string;
  redeemUrl?: string;
  recipientName?: string;
  message?: string;
  supportEmail?: string;
};

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function parseNumber(n?: string | null) {
  if (!n) return undefined;
  const x = Number(n);
  return Number.isFinite(x) ? x : undefined;
}

function qrUrlFor(redeemUrl: string) {
  return `${appUrl()}/api/qr?data=${encodeURIComponent(redeemUrl)}&scale=6&margin=2`;
}

// Allow both GET (quick manual test) and POST (programmatic)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") || "";
  const code = url.searchParams.get("code") || "ABCD-1234";
  const amount = parseNumber(url.searchParams.get("amount")) ?? 25;
  const currency = url.searchParams.get("currency") || "USD";
  const businessName = url.searchParams.get("business") || "Sample Restaurant";
  const recipientName = url.searchParams.get("name") || undefined;
  const message = url.searchParams.get("message") || undefined;

  if (!to) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Missing "to" email. Example: /api/test-send-gift?to=you@example.com&code=GIF-2025&amount=25&currency=USD&business=La Pupusería',
      },
      { status: 400 }
    );
  }

  const redeemUrl =
    url.searchParams.get("redeemUrl") ||
    `${appUrl()}/card/${encodeURIComponent(code)}`;
  const qrcodeSrc = qrUrlFor(redeemUrl);

  try {
    const res = await sendGiftEmail(to, {
      code,
      amount,
      currency,
      businessName,
      redeemUrl,
      qrcodeSrc,
      recipientName,
      message,
      supportEmail: "support@gifty.app",
    });

    return NextResponse.json({ ok: true, result: res });
  } catch (err: any) {
    console.error("[test-send-gift] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;

    if (!body?.to) {
      return NextResponse.json(
        { ok: false, error: 'Body must include "to" email' },
        { status: 400 }
      );
    }

    const code = body.code || "ABCD-1234";
    const amount = body.amount ?? 25;
    const currency = body.currency || "USD";
    const businessName = body.businessName || "Sample Restaurant";
    const redeemUrl =
      body.redeemUrl || `${appUrl()}/card/${encodeURIComponent(code)}`;
    const qrcodeSrc = qrUrlFor(redeemUrl);

    const res = await sendGiftEmail(body.to, {
      code,
      amount,
      currency,
      businessName,
      redeemUrl,
      qrcodeSrc,
      recipientName: body.recipientName,
      message: body.message,
      supportEmail: body.supportEmail || "support@gifty.app",
    });

    return NextResponse.json({ ok: true, result: res });
  } catch (err: any) {
    console.error("[test-send-gift] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
