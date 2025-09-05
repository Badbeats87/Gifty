// src/app/b/[slug]/page.tsx
import PurchaseClient from "./purchase-client";
import { supabaseServer } from "@/lib/supabase";

type PageProps = {
  // Next.js 15 makes these async to enable streaming
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BusinessPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const _sp = await searchParams; // reserved for future use

  const supabase = supabaseServer();
  // If you don't have this RPC, you can remove it and just keep the fallback below.
  const { data, error } = await supabase.rpc("get_business_public", {
    p_slug: slug,
  });

  const business =
    data ??
    ({
      name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      logo_url: null,
    } as { name: string; logo_url?: string | null });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <a href="/" className="text-sm text-gray-600 hover:underline">
        ← Back
      </a>

      <div className="mt-6 flex items-center gap-4">
        {business.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${business.name} logo`}
            src={business.logo_url}
            className="h-12 w-12 rounded"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-200 text-sm">
            {business.name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
        )}

        <div>
          <h1 className="text-2xl font-semibold">{business.name}</h1>
          <p className="text-sm text-gray-600">Gift cards by {business.name}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-lg font-medium">Buy a gift card</h2>
        <PurchaseClient businessSlug={slug} businessName={business.name} />
      </div>

      {error ? (
        <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Could not load business from database (using fallback). You can seed
          it later; this won’t block test purchases.
        </div>
      ) : null}

      <div className="mt-10 text-xs text-gray-500">
        Merchant dashboard
        <br />
        © {new Date().getFullYear()} Gifty — Send gifts, not remittances.
      </div>
    </div>
  );
}
