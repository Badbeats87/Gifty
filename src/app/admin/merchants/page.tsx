// src/app/admin/merchants/page.tsx
import { getSupabaseServer } from "@/src/lib/supabaseServer";

type BusinessRow = {
  id: string;
  name: string | null;
  status?: string | null;
  contact_email?: string | null;
  created_at?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
};

export default async function AdminMerchants() {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("businesses")
    .select(
      `
      id,
      name,
      status,
      contact_email,
      created_at,
      stripe_charges_enabled,
      stripe_payouts_enabled
    `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    // Show a friendly error (kept simple for MVP)
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold mb-6">🏪 Merchants</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
          Failed to load merchants: <span className="font-mono">{error.message}</span>
        </div>
      </main>
    );
  }

  const rows: BusinessRow[] = data ?? [];

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">🏪 Merchants</h1>

      {/* Filters (placeholder for later) */}
      <section className="mb-6 flex flex-wrap gap-3">
        <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
          Status: All
        </button>
        <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
          Stripe: Any
        </button>
        <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
          Date: Last 30 days
        </button>
      </section>

      {rows.length === 0 ? (
        <div className="p-6 border rounded bg-gray-50">
          No merchants found. Once you add businesses in Supabase, they’ll show up here.
        </div>
      ) : (
        <section className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2 border-b">Business</th>
                <th className="px-4 py-2 border-b">Stripe</th>
                <th className="px-4 py-2 border-b">Status</th>
                <th className="px-4 py-2 border-b">Contact</th>
                <th className="px-4 py-2 border-b">Created</th>
                <th className="px-4 py-2 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const stripeStatus =
                  (m.stripe_charges_enabled ? "charges✓" : "charges–") +
                  " · " +
                  (m.stripe_payouts_enabled ? "payouts✓" : "payouts–");

                const created =
                  m.created_at
                    ? new Date(m.created_at).toLocaleString()
                    : "—";

                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border-b">
                      <div className="font-medium">{m.name ?? "—"}</div>
                      <div className="text-xs text-gray-500 font-mono">{m.id}</div>
                    </td>
                    <td className="px-4 py-2 border-b">{stripeStatus}</td>
                    <td className="px-4 py-2 border-b">
                      {m.status ?? "—"}
                    </td>
                    <td className="px-4 py-2 border-b">
                      {m.contact_email ?? "—"}
                    </td>
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
