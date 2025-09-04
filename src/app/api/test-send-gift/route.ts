export const runtime = "nodejs"; // keep this

import { NextRequest, NextResponse } from "next/server";
import { sendGiftEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get("x-test-key");
    const expected = process.env.TEST_ENDPOINT_KEY;
    if (!expected || key !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { to, businessName, amountUsd, code, message } = body ?? {};

    if (!to || !businessName || typeof amountUsd !== "number" || !code) {
      return NextResponse.json(
        { error: "Missing required fields: to, businessName, amountUsd, code" },
        { status: 400 }
      );
    }

    const data = await sendGiftEmail({ to, businessName, amountUsd, code, message });
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    // 👇 add DETAIL so we can see what's failing
    const detail = {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      cause: err?.cause,
    };
    console.error("Email send failed", detail, err); // keep server logs too
    return NextResponse.json({ error: "send_failed", detail }, { status: 500 });
  }
}
