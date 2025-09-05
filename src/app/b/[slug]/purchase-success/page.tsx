// src/app/b/[slug]/purchase-success/page.tsx

type PageProps = {
    // Next.js 15 makes these async to enable streaming
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ session_id?: string }>;
  };
  
  export default async function PurchaseSuccessPage({ params, searchParams }: PageProps) {
    const { slug } = await params;
    const sp = await searchParams;
    const sessionId =
      typeof sp?.session_id === "string" ? sp.session_id : undefined;
  
    return (
      <div className="mx-auto max-w-2xl p-6 space-y-6">
        <a href={`/b/${slug}`} className="text-sm text-gray-600 hover:underline">
          ← Back to {slug.replace(/-/g, " ")}
        </a>
  
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Payment successful 🎉</h1>
          <p className="text-gray-700">
            Thanks! Your payment was processed. We’ll generate your gift and send
            the confirmation email shortly.
          </p>
          {sessionId ? (
            <p className="text-xs text-gray-500 break-all">
              Stripe session: <code>{sessionId}</code>
            </p>
          ) : null}
        </div>
  
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Heads up: emails are sent by the <strong>webhook</strong>. We’ll wire
          that up next (so you’ll see the message arrive automatically).
        </div>
      </div>
    );
  }
  