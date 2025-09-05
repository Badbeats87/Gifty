// src/app/b/[slug]/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import BuyGiftForm from "./BuyGiftForm";

type Business = {
  id: string;
  name: string | null;
  logo_url?: string | null;
};

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Next 15: params is async in RSCs
  const { slug } = await params;

  const supabase = await supabaseServer();

  // Try to load by ID first (home links by ID), then fall back to slug (if present)
  async function fetchBusiness(): Promise<{ data: Business | null; error?: any }> {
    // by ID
    let res = await supabase
      .from("businesses")
      .select("id, name, logo_url")
      .eq("id", slug)
      .single();

    if (!res.error && res.data) return { data: res.data as Business };

    // by slug (if the column exists)
    const bySlug = await supabase
      .from("businesses")
      .select("id, name, logo_url")
      .eq("slug", slug)
      .single();

    if (!bySlug.error && bySlug.data) return { data: bySlug.data as Business };

    return { data: null, error: bySlug.error ?? res.error };
  }

  const { data: business, error } = await fetchBusiness();

  if (!business) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Link href="/" className="underline">
          ← Back
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Business not found</h1>
        <p className="mt-2 text-gray-700">
          We couldn’t find a business for{" "}
          <code className="px-1 py-0.5 rounded bg-gray-100">{slug}</code>.
        </p>
        {error ? (
          <p className="mt-2 text-sm text-gray-500">
            Details: {error.message ?? String(error)}
          </p>
        ) : null}
        <p className="mt-6">
          <Link href="/" className="underline">
            Back to home
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="underline">
        ← Back
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold">{business.name ?? "Business"}</h1>
        {business.logo_url ? (
          // use <img> to avoid next/image domain config during setup
          <img
            src={business.logo_url}
            alt={`${business.name ?? "Business"} logo`}
            width={96}
            height={96}
            className="rounded mt-3"
          />
        ) : null}
      </header>

      <section className="mt-6">
        <BuyGiftForm businessId={business.id} businessName={business.name ?? "Business"} />
      </section>
    </main>
  );
}
