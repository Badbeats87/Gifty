import { supabaseServer } from '@/lib/supabase';
import Link from 'next/link';

export default async function HomePage() {
  const supabase = supabaseServer();
  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('id,name,slug,logo_url')
    .order('created_at', { ascending: true });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-10">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gifty</h1>
        <Link href="/dashboard" className="underline">
          Merchant dashboard
        </Link>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-4">Buy a Gift Card</h2>

        {error && <p className="text-red-600">Error: {error.message}</p>}

        {!error && (!businesses || businesses.length === 0) && (
          <p className="text-gray-600">No businesses available yet.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {businesses?.map((biz) => (
            <Link
              key={biz.id}
              href={`/b/${biz.slug}`}
              className="border rounded-xl p-4 hover:shadow"
            >
              {biz.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={biz.logo_url}
                  alt={`${biz.name} logo`}
                  className="h-16 w-16 object-cover rounded-lg mb-2"
                />
              ) : (
                <div className="h-16 w-16 bg-gray-200 rounded-lg mb-2" />
              )}
              <h3 className="text-lg font-semibold">{biz.name}</h3>
              <p className="text-sm text-gray-600">Gift cards available</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-xl font-semibold mb-2">Are you a business?</h2>
        <p className="text-gray-600 mb-2">
          Register to start selling gift cards directly to your customers.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-black text-white px-4 py-2 rounded-lg"
        >
          Start selling gift cards
        </Link>
      </section>
    </div>
  );
}
