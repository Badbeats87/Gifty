// src/app/admin/gift-cards/page.tsx
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

type GiftCardRow = {
  id: string;
  code?: string | null;
  business_id?: string | null;
  amount_usd?: number | null;
  status?: string | null; // e.g., issued | redeemed | voided
  issued_at?: string | null;
  redeemed_at?: string | null;
  created_at?: string | null; // fallback if issued_at not present
  buyer_email?: string | null;
  recipient_email?: string | null;
};

type BusinessRow = {
  id: string;
  name: string;
};

function formatUSD(n: number | null | undefined) {
  if (typeof n !== "number") return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export default async function AdminGiftCards() {
  const supabase = getSupabaseAdmin();

  // 1) Fetch gift cards (most recent first)
  const { data: cards, error: cardsErr } = await supabase
    .from("gift_cards")
    .select(
      `
      id,
      code,
      business_id,
      amount_usd,
      status,
      issued_at,
      redeemed_at,
      created_at,
      buyer_email,
      recipient_email
    `
    )
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  if (cardsErr) {
    return (
      <main className="max-w-6xl mx-auto w-full">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">🎁 Gift Cards (ADMIN)</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
          Failed to load gift cards: <span className="font-mono">{cardsErr.message}</span>
        </div>
      </main>
    );
  }

  const rows: GiftCardRow[] = (cards ?? []) as GiftCardRow[];

  // 2) Lookup business names for the set of business_ids we saw
  const bizIds = Array.from(
    new Set(rows.map((r) => r.business_id).filter((x): x is string => !!x))
  );

  let bizMap = new Map<string, string>();
  if (bizIds.length > 0) {
    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("id, name")
      .in("id", bizIds);

    if (!bizErr && biz) {
      (biz as BusinessRow[]).forEach((b) => bizMap.set(b.id, b.name));
    }
  }

  return (
    <main className="max-w-6xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6 text-gray-900">🎁 Gift Cards (ADMIN)</h1>

      {rows.length === 0 ? (
        <div className="p-6 border border-gray-200 rounded bg-gray-50 text-gray-900">
          No gift cards found. As purchases are made, they’ll show up here.
        </div>
      ) : (
        <section className="overflow-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm text-gray-900">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="text-left">
                <Th>Code</Th>
                <Th>Merchant</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Issued At</Th>
                <Th>Redeemed At</Th>
                <Th>Buyer</Th>
                <Th>Recipient</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-gray-50">
              {rows.map((g) => {
                const codeShort = g.code
                  ? g.code.length > 12
                    ? `${g.code.slice(0, 4)}•••${g.code.slice(-4)}`
                    : g.code
                  : g.id.slice(0, 8);
                const merchant = g.business_id ? bizMap.get(g.business_id) ?? "—" : "—";
                const amount = formatUSD(g.amount_usd ?? null);
                const status = (g.status ?? "—").toString();
                const issued =
                  g.issued_at
                    ? new Date(g.issued_at).toLocaleString()
                    : g.created_at
                    ? new Date(g.created_at).toLocaleString()
                    : "—";
                const redeemed = g.redeemed_at ? new Date(g.redeemed_at).toLocaleString() : "—";
                const buyer = g.buyer_email ?? "—";
                const recipient = g.recipient_email ?? "—";

                return (
                  <tr key={g.id} className="hover:bg-gray-100">
                    <Td>
                      <div className="font-medium">{codeShort}</div>
                      <div className="text-xs text-gray-600 font-mono">{g.id}</div>
                    </Td>
                    <Td>{merchant}</Td>
                    <Td>{amount}</Td>
                    <Td className="capitalize">{status}</Td>
                    <Td>{issued}</Td>
                    <Td>{redeemed}</Td>
                    <Td className="truncate max-w-[180px]">{buyer}</Td>
                    <Td className="truncate max-w-[180px]">{recipient}</Td>
                    <Td>
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => navigator.clipboard?.writeText(g.code ?? "")}
                      >
                        Copy code
                      </button>
                    </Td>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 border-b border-gray-200 text-xs font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 border-b border-gray-200 align-top">{children}</td>;
}
