// src/app/admin/gift-cards/page.tsx
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import CopyCode from "./CopyCode";

type AnyRow = Record<string, any>;

function pickAmount(row: AnyRow): number | null {
  if (typeof row.amount_usd === "number") return row.amount_usd;
  if (typeof row.amount === "number") return row.amount;
  if (typeof row.value_usd === "number") return row.value_usd;
  if (typeof row.value_cents === "number") return row.value_cents / 100;
  return null;
}

function pickIssuedAt(row: AnyRow): string | null {
  // be flexible with timestamp columns
  return row.issued_at ?? row.created_at ?? row.purchased_at ?? row.updated_at ?? null;
}

function formatUSD(n: number | null | undefined) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
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

  // --- 1) Try to fetch with a safe order; fall back if column doesn't exist
  let rows: AnyRow[] = [];
  let lastErr: string | null = null;

  // Attempt A: order by created_at (common)
  {
    const { data, error } = await supabase
      .from("gift_cards")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (!error && data) {
      rows = data as AnyRow[];
    } else {
      lastErr = error?.message ?? null;
    }
  }

  // Attempt B: no order (if created_at doesn’t exist)
  if (rows.length === 0) {
    const { data, error } = await supabase.from("gift_cards").select("*").limit(300);
    if (!error && data) {
      rows = data as AnyRow[];
      lastErr = null;
    } else {
      lastErr = error?.message ?? lastErr;
    }
  }

  // --- 2) If still failing, show the error
  if (lastErr) {
    return (
      <main className="max-w-6xl mx-auto w-full">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">🎁 Gift Cards (ADMIN)</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
          Failed to load gift cards: <span className="font-mono">{lastErr}</span>
        </div>
      </main>
    );
  }

  // --- 3) Optional: lookup business names if business_id exists
  const bizIds = Array.from(
    new Set(rows.map((r) => r.business_id).filter((x): x is string => !!x))
  );

  let bizMap = new Map<string, string>();
  if (bizIds.length > 0) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("id, name")
      .in("id", bizIds);
    (biz ?? []).forEach((b: any) => bizMap.set(b.id, b.name));
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
                const id: string = g.id;
                const code: string | undefined = g.code;
                const businessId: string | undefined = g.business_id;
                const merchant = businessId ? bizMap.get(businessId) ?? "—" : "—";
                const amount = formatUSD(pickAmount(g));
                const status = (g.status ?? g.state ?? "—").toString();
                const issuedAt = pickIssuedAt(g);
                const redeemedAt: string | null = g.redeemed_at ?? g.redeemedAt ?? null;
                const buyer: string | null = g.buyer_email ?? g.buyer ?? null;
                const recipient: string | null = g.recipient_email ?? g.recipient ?? null;

                const codeShort = code
                  ? code.length > 12
                    ? `${code.slice(0, 4)}•••${code.slice(-4)}`
                    : code
                  : id?.slice(0, 8);

                return (
                  <tr key={id} className="hover:bg-gray-100">
                    <Td>
                      <div className="font-medium">{codeShort ?? "—"}</div>
                      <div className="text-xs text-gray-600 font-mono">{id}</div>
                    </Td>
                    <Td>{merchant}</Td>
                    <Td>{amount}</Td>
                    <Td className="capitalize">{status}</Td>
                    <Td>{issuedAt ? new Date(issuedAt).toLocaleString() : "—"}</Td>
                    <Td>{redeemedAt ? new Date(redeemedAt).toLocaleString() : "—"}</Td>
                    <Td className="truncate max-w-[180px]">{buyer ?? "—"}</Td>
                    <Td className="truncate max-w-[180px]">{recipient ?? "—"}</Td>
                    <Td>
                      {code ? <CopyCode value={code} /> : <span className="text-gray-500">—</span>}
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
