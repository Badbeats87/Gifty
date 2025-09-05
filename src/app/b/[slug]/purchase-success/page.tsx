// src/app/b/[slug]/purchase-success/page.tsx
import ShowGiftClient from "./ShowGiftClient";

type PageProps = {
  // Next.js 15: async params + searchParams
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
};

export default async function PurchaseSuccessPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const sessionId = typeof sp?.session_id === "string" ? sp.session_id : undefined;

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <a href={`/b/${slug}`} className="text-sm text-gray-600 hover:underline">
        ← Back to {slug.replace(/-/g, " ")}
      </a>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Payment successful 🎉</h1>
        <p className="text-gray-700">
          Thanks! We’re generating your gift code and sending the email.
        </p>
      </div>

      <ShowGiftClient sessionId={sessionId} />
    </div>
  );
}
