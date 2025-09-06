// src/lib/qrcode.ts
import QRCode from "qrcode";

/**
 * Generate a PNG Data URL QR code for the given text.
 * Example output: "data:image/png;base64,AAAA..."
 */
export async function generateQRCodeDataURL(text: string): Promise<string> {
  // Higher margin for better scan reliability in emails
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 6,
    type: "image/png",
  });
}
