// src/app/cancel/page.tsx
import Link from "next/link";

export default function CancelPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="underline">
        ← Back to home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Payment canceled</h1>
      <p className="mt-2 text-gray-700">
        No worries—your card wasn’t charged. You can try again anytime.
      </p>
      <p className="mt-6">
        <Link href="/" className="underline">
          Browse businesses
        </Link>
      </p>
    </main>
  );
}
