// src/app/admin/merchants/page.tsx
import { getSupabaseServer } from "@/src/lib/supabaseServer";

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  stripe_account_id: string | null;
  created_at: string | null;
};

export default async function AdminMerchants() {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, stripe_account_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold mb-6">🏪 Merchants</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
          Failed to load merchants: <span className="font-mono">{error.message}</span>
        </div>
      </main>
    );
  }

  const rows: BusinessRow[] = (data ?? []) as BusinessRow[];

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">🏪 Merchants</h1>

      {/* Filters (placeholder) */}
      <section className="mb-6 flex flex-wrap gap-3">
        <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
          All
        </button>
        <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
          Connected
        </button>
        <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
          Not Connected
        </button>
      </section>

      {rows.length === 0 ? (
        <div className="p-6 border rounded bg-gray-50">
          No merchants found. Add rows to <span className="font-mono">public.businesses</span> and they’ll appear here.
        </div>
      ) : (
        <section className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2 border-b">Business</th>
                <th className="px-4 py-2 border-b">Slug</th>
                <th className="px-4 py-2 border-b">Stripe Account</th>
                <th className="px-4 py-2 border-b">Created</th>
                <th className="px-4 py-2 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const created = m.created_at
                  ? new Date(m.created_at).toLocaleString()
                  : "—";
                const stripeStatus = m.stripe_account_id
                  ? `connected (${m.stripe_account_id})`
                  : "not connected";

                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border-b">
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{m.id}</div>
                    </td>
                    <td className="px-4 py-2 border-b">{m.slug}</td>
                    <td className="px-4 py-2 border-b">{stripeStatus}</td>
                    <td className="px-4 py-2 border-b">{created}</td>
                    <td className="px-4 py-2 border-b text-blue-600">
                      View
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
