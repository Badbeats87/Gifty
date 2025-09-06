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
    return s as string;
  }
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(+dt)) return "—";
  return dt.toLocaleString();
}

/**
 * Higher-contrast pill badges
 */
function Badge({
  tone = "gray",
  children,
}: {
  tone?: "green" | "yellow" | "red" | "gray" | "blue";
  children: React.ReactNode;
}) {
  const tones: Record<
    NonNullable<Parameters<typeof Badge>[0]["tone"]>,
    string
  > = {
    green:
      "bg-green-50 text-green-700 ring-1 ring-inset ring-green-300 dark:bg-green-900/20 dark:text-green-200 dark:ring-green-700/60",
    yellow:
      "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-200 dark:ring-yellow-700/60",
    red:
      "bg-red-50 text-red-700 ring-1 ring-inset ring-red-300 dark:bg-red-900/20 dark:text-red-200 dark:ring-red-700/60",
    gray:
      "bg-gray-100 text-gray-800 ring-1 ring-inset ring-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700/80",
    blue:
      "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-300 dark:bg-blue-900/20 dark:text-blue-200 dark:ring-blue-700/60",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Cell({
  children,
  colSpan,
}: {
  children: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td
      className="px-4 py-3 border-b border-gray-200 align-middle text-gray-900"
      colSpan={colSpan}
    >
      {children}
    </td>
  );
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

    const stripeIdCandidates = [
      b.stripe_account_id,
      b.stripe_connect_account_id,
      b.stripe_connected_account,
      b.stripe_connect_id,
      b.stripe_account,
    ].filter((v: any) => typeof v === "string") as string[];
    const stripeAccountId = stripeIdCandidates.find((v) => v.startsWith("acct_")) ?? null;
    const isConnected = Boolean(stripeAccountId);

    const chargesEnabled = Boolean(b.stripe_charges_enabled ?? b.charges_enabled ?? null);
    const payoutsEnabled = Boolean(b.stripe_payouts_enabled ?? b.payouts_enabled ?? null);

    let status: string = "—";
    if (typeof b.status === "string" && b.status.trim().length > 0) {
      status = titleCase(b.status);
    } else if (chargesEnabled || payoutsEnabled) {
      status = chargesEnabled && payoutsEnabled ? "Active" : "Pending";
    } else if (isConnected) {
      status = "Connected";
    }

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
      contact: b.contact_email ?? b.email ?? null,
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
                  <Cell colSpan={6}>
                    <div className="p-6 text-gray-700">No merchants found.</div>
                  </Cell>
                </tr>
              ) : (
                derived.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-100">
                    <Cell>
                      <div className="flex items-center gap-3">
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
                        {m.isConnected ? (
                          <Badge tone="green">Connected</Badge>
                        ) : (
                          <Badge tone="gray">Not Connected</Badge>
                        )}
                        {m.chargesEnabled && <Badge tone="blue">Charges</Badge>}
                        {m.payoutsEnabled && <Badge tone="blue">Payouts</Badge>}
                      </div>
                      <div className="text-xs text-gray-700 mt-1 truncate max-w-[240px]">
                        {m.stripeAccountId ?? "—"}
                      </div>
                    </Cell>

                    <Cell>
                      {m.status === "Active" ? (
                        <Badge tone="green">Active</Badge>
                      ) : m.status === "Pending" ? (
                        <Badge tone="yellow">Pending</Badge>
                      ) : m.status === "Disconnected" ? (
                        <Badge tone="red">Disconnected</Badge>
                      ) : m.status === "Connected" ? (
                        <Badge tone="green">Connected</Badge>
                      ) : (
                        <Badge tone="gray">{m.status || "—"}</Badge>
                      )}
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
