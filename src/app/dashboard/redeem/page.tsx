// src/app/dashboard/redeem/page.tsx
import QRScannerClient from "./QRScannerClient";

export default function RedeemPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 grid gap-6">
      <h1 className="text-2xl font-semibold">Redeem a gift</h1>

      {/* QR scanner & manual entry */}
      <QRScannerClient />

      <p className="text-sm text-gray-500">
        Tip: the QR encodes either the gift code itself or a link to{" "}
        <code className="bg-gray-100 px-1 rounded">/card/&lt;code&gt;</code>.
        You can also paste a code or URL into the input if scanning is unavailable.
      </p>
    </div>
  );
}
