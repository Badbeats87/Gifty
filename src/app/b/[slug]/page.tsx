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
      <div className="p-6">
        <h1 className="text-2xl font-bold">Error</h1>
        <p className="text-red-600">{error.message}</p>
        <Link href="/" className="underline">Go home</Link>
      </div>
    );
  }

  const biz = Array.isArray(data) ? data[0] : data;
  if (!biz) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Not found</h1>
        <p>No business with slug “{params.slug}”.</p>
        <Link href="/" className="underline">Go home</Link>
      </div>
    );
  }

  const success = searchParams?.success === '1';
  const canceled = searchParams?.canceled === '1';
  const sessionId = typeof searchParams?.session_id === 'string' ? searchParams.session_id : undefined;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-4">
        {biz.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={biz.logo_url} alt={`${biz.name} logo`} className="h-12 w-12 rounded-xl object-cover" />
        ) : (
          <div className="h-12 w-12 rounded-xl bg-gray-200" />
        )}
        <div>
          <h1 className="text-3xl font-bold">{biz.name}</h1>
          <p className="text-gray-600">Gift cards by {biz.name}</p>
        </div>
      </header>

      {success && (
        <div className="rounded-lg border p-3 bg-green-50 space-y-2">
          <p>Payment succeeded! We’re issuing your gift card…</p>
          {sessionId && <PurchaseSuccess sessionId={sessionId} />}
        </div>
      )}
      {canceled && (
        <div className="rounded-lg border p-3 bg-yellow-50">
          <p>Payment canceled.</p>
        </div>
      )}

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="text-xl font-semibold">Buy a gift card</h2>
        <ClientBuyForm slug={biz.slug} businessName={biz.name} />
      </section>

      <footer className="text-sm text-gray-500">
        <Link href="/dashboard" className="underline">Merchant dashboard</Link>
      </footer>
    </div>
  );
}
