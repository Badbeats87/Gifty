// src/app/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type Biz = {
  id: string;
  name: string | null;
  logo_url?: string | null;
};

export default async function HomePage() {
  const supabase = await supabaseServer();

  // Only select columns that are guaranteed to exist
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, logo_url")
    .order("name", { ascending: true })
    .limit(24);

  const businesses: Biz[] = error ? [] : (data as Biz[]) ?? [];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Gifty</h1>
        <p className="mt-2 text-gray-700">
          Send instant gifts people actually enjoy.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">Featured businesses</h2>

        {error ? (
          <p className="mt-3 text-red-600">
            Error loading businesses: {error.message}
          </p>
        ) : businesses.length === 0 ? (
          <p className="mt-3 text-gray-600">No businesses yet.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {businesses.map((b) => {
              const href = `/b/${b.id}`; // <- always use ID for reliability
              return (
                <li key={b.id} className="border rounded-lg p-4">
                  <Link href={href} className="flex items-center gap-3">
                    {b.logo_url ? (
                      // use <img> to avoid next/image domain config during setup
                      <img
                        src={b.logo_url}
                        alt={`${b.name ?? "Business"} logo`}
                        width={48}
                        height={48}
                        className="rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-200" />
                    )}
                    <span className="font-medium">{b.name ?? "Unnamed business"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
