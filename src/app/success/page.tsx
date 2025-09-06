// src/app/success/page.tsx
import Link from "next/link";
import SuccessClient from "./SuccessClient";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function SuccessPage({ searchParams }: PageProps) {
  const sessionId =
    (searchParams?.session_id as string | undefined) ||
    (searchParams?.sid as string | undefined);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-sm text-blue-600 underline inline-flex items-center gap-1">
        ← Back to home
      </Link>

      <h1 className="text-2xl font-semibold mt-4">Payment successful 🎉</h1>

      <div className="mt-4">
        <SuccessClient initialSessionId={sessionId} />
      </div>

      <div className="mt-8">
        <Link href="/" className="text-blue-600 underline">
          Back to home
        </Link>
      </div>
    </div>
  );
}
