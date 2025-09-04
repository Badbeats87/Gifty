import { supabaseServer } from '@/lib/supabase';
import Link from 'next/link';
import ClientBuyForm from './purchase-client';
import PurchaseSuccess from './purchase-success';

type Props = {
  params: { slug: string };
  searchParams?: { [key: string]: string | string[] | undefined };
};

export default async function BusinessPage({ params, searchParams }: Props) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.rpc('get_business_public', { p_slug: params.slug });

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Error</h1>
        <p className="text-red-600">{error.message}</p>
        <p className="mt-4">
          <Link href="/" className="underline">Go back</Link>
        </p>
      </div>
    );
  }

  const biz = Array.isArray(data) ? data[0] : data;
  if (!biz) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Not found</h1>
        <p className="text-gray-600">This business doesn’t exist.</p>
        <p className="mt-4">
          <Link href="/" className="underline">Go back</Link>
        </p>
      </div>
    );
  }

  // 👇 Stripe redirect sends ?session_id=cs_test_...
  const sessionId =
    typeof searchParams?.session_id === 'string' ? searchParams.session_id : undefined;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        {biz.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={biz.logo_url} alt={`${biz.name} logo`} className="h-14 w-14 rounded-lg" />
        )}
        <h1 className="text-2xl font-bold">{biz.name}</h1>
        <p className="text-sm text-gray-500">Gift cards by {biz.name}</p>
      </header>

      {sessionId && (
        <div className="rounded-2xl border p-4 bg-green-50">
          {/* 👇 This component will POST to /api/checkout/fulfill with the sessionId */}
          <PurchaseSuccess sessionId={sessionId} />
        </div>
      )}

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="text-xl font-semibold">Buy a gift card</h2>
        <ClientBuyForm slug={biz.slug} businessName={biz.name} businessId={biz.id} />
      </section>

      <footer className="text-sm text-gray-500">
        <Link href="/dashboard" className="underline">Merchant dashboard</Link>
      </footer>
    </div>
  );
}
