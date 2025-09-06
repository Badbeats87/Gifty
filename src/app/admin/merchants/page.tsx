// src/app/admin/merchants/page.tsx
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

type AnyRow = Record<string, any>;

function titleCase(s: string) {
  try {
    return s
      .toString()
      .split(/[\s_\-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  } catch {
    return s;
  }
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(+dt)) return "—";
  return dt.toLocaleString();
}

function badge(text: string, tone: "green" | "yellow" | "red" | "gray" = "gray") {
  const tones: Record<typeof tone, string> = {
    green:
      "bg-green-100 text-green-800 ring-1 ring-inset ring-green-200 dark:bg-green-900/20 dark:text-green-300",
    yellow:
      "bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300",
    red:
      "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-900/20 dark:text-red-300",
    gray:
      "bg-gray-100 text-gray-800 ring-1 ring-inset ring-gray-200 dark:bg-gray-900/20 dark:text-gray-300",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>
      {text}
    </span>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 border-b border-gray-200 align-middle text-gray-900">{children}</td>;
}
function Head({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-700">
      {children}
    </th>
  );
}

export default async function AdminMerchants() {
  const supabase = getSupabaseAdmin();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);

  const rows: AnyRow[] = (businesses ?? []) as AnyRow[];

  // Derive “connected” + “active” in a schema-flexible way
  const derived = rows.map((b) => {
    const name: string = b.name ?? "(Unnamed)";
    const slug: string | null = b.slug ?? null;

    // Stripe connect detection
    const stripeIdCandidates = [
      b.stripe_account_id,
      b.stripe_connect_account_id,
      b.stripe_connected_account,
      b.stripe_connect_id,
      b.stripe_account,
    ].filter((v: any) => typeof v === "string") as string[];
    const stripeAccountId = stripeIdCandidates.find((v) => v.startsWith("acct_")) ?? null;
    const isConnected = Boolean(stripeAccountId);

    // If your schema has explicit flags, prefer those
    const chargesEnabled = Boolean(b.stripe_charges_enabled ?? b.charges_enabled ?? null);
    const payoutsEnabled = Boolean(b.stripe_payouts_enabled ?? b.payouts_enabled ?? null);

    // Status: prefer explicit `status` column; else infer from Stripe flags; else unknown
    let status: string = "—";
    if (typeof b.status === "string" && b.status.trim().length > 0) {
      status = titleCase(b.status);
    } else if (chargesEnabled || payoutsEnabled) {
      status = chargesEnabled && payoutsEnabled ? "Active" : "Pending";
    } else if (isConnected) {
      status = "Connected";
    }

    // Active definition for KPI: if we have flags use them; else treat connected as active; else fall back to present row
    const isActive =
      typeof b.status === "string"
        ? b.status.toLowerCase() === "active"
        : chargesEnabled || payoutsEnabled || isConnected;

    return {
      id: b.id as string,
      name,
      slug,
      created_at: b.created_at ?? null,
      stripeAccountId,
      isConnected,
      chargesEnabled,
      payoutsEnabled,
      status,
      isActive,
      owner_user_id: b.owner_user_id ?? null,
      contact: b.contact_email ?? b.email ?? null, // optional columns; may be null
      logo_url: b.logo_url ?? null,
    };
  });

  const total = derived.length;
  const connectedCount = derived.filter((d) => d.isConnected).length;
  const activeCount = derived.filter((d) => d.isActive).length;

  return (
    <main className="max-w-6xl mx-auto w-full px-6 py-8">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">🏪 Merchants</h1>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Total Merchants</h2>
          <p className="text-2xl font-bold text-gray-900">{total}</p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Active</h2>
          <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
          <p className="text-xs text-gray-600 mt-1">
            Based on status/charges_enabled/payouts_enabled/connection
          </p>
        </div>
        <div className="p-6 bg-gray-100 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Stripe Connected</h2>
          <p className="text-2xl font-bold text-gray-900">{connectedCount}</p>
          <p className="text-xs text-gray-600 mt-1">Has acct_… in Stripe id</p>
        </div>
      </section>

      {/* Table */}
      <section className="mb-16">
        <div className="overflow-auto border border-gray-200 rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <Head>Business</Head>
                <Head>Stripe</Head>
                <Head>Status</Head>
                <Head>Contact</Head>
                <Head>Created</Head>
                <Head>Actions</Head>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-gray-50">
              {derived.length === 0 ? (
                <tr>
                  <Cell colSpan={6 as any}>
                    <div className="p-6 text-gray-700">No merchants found.</div>
                  </Cell>
                </tr>
              ) : (
                derived.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-100">
                    <Cell>
                      <div className="flex items-center gap-3">
                        {/* logo (optional) */}
                        {m.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.logo_url}
                            alt=""
                            className="w-8 h-8 rounded object-cover ring-1 ring-gray-200"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center text-xs text-gray-600">
                            {m.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate max-w-[220px]">
                            {m.name}
                          </div>
                          <div className="text-xs text-gray-600 truncate max-w-[220px]">
                            {m.slug ? `/${m.slug}` : m.id}
                          </div>
                        </div>
                      </div>
                    </Cell>

                    <Cell>
                      <div className="flex items-center gap-2">
                        {m.isConnected
                          ? badge("Connected", "green")
                          : badge("Not Connected", "gray")}
                        {m.chargesEnabled && badge("Charges", "green")}
                        {m.payoutsEnabled && badge("Payouts", "green")}
                      </div>
                      <div className="text-xs text-gray-600 mt-1 truncate max-w-[240px]">
                        {m.stripeAccountId ?? "—"}
                      </div>
                    </Cell>

                    <Cell>
                      {m.status === "Active"
                        ? badge("Active", "green")
                        : m.status === "Pending"
                        ? badge("Pending", "yellow")
                        : m.status === "Disconnected"
                        ? badge("Disconnected", "red")
                        : badge(m.status || "—", "gray")}
                    </Cell>

                    <Cell>{m.contact ?? "—"}</Cell>

                    <Cell>{formatDate(m.created_at)}</Cell>

                    <Cell>
                      <a
                        href={`/admin/merchants/${m.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        View
                      </a>
                    </Cell>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
