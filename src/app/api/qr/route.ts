// src/app/api/qr/route.ts
import { NextResponse } from "next/server";
import QRCode from "qrcode";

/**
 * GET /api/qr?data=...&scale=6&margin=2
 * Returns a PNG QR code for the provided string in the "data" query param.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const data = url.searchParams.get("data");
    if (!data) {
      return new NextResponse("Missing 'data' query param", { status: 400 });
    }

    const scaleParam = url.searchParams.get("scale");
    const marginParam = url.searchParams.get("margin");
    const scale = scaleParam ? Math.min(10, Math.max(2, Number(scaleParam))) : 6;
    const margin = marginParam ? Math.min(8, Math.max(0, Number(marginParam))) : 2;

    const buffer = await QRCode.toBuffer(data, {
      errorCorrectionLevel: "M",
      margin,
      scale,
      type: "png",
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error("[api/qr] error", err);
    return new NextResponse("Failed to generate QR", { status: 500 });
  }
}
