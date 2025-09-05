// src/app/admin/transactions/page.tsx
export default function AdminTransactions() {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold mb-6">💰 Transactions</h1>
  
        {/* Filters (placeholder) */}
        <section className="mb-6 flex flex-wrap gap-3">
          <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
            Merchant: All
          </button>
          <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
            Status: All
          </button>
          <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
            Date: Last 30 days
          </button>
          <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
            Export CSV
          </button>
        </section>
  
        {/* Placeholder Table */}
        <section className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2 border-b">Order ID</th>
                <th className="px-4 py-2 border-b">Merchant</th>
                <th className="px-4 py-2 border-b">Gross (USD)</th>
                <th className="px-4 py-2 border-b">Service Fee</th>
                <th className="px-4 py-2 border-b">Commission</th>
                <th className="px-4 py-2 border-b">Merchant Payout</th>
                <th className="px-4 py-2 border-b">Stripe Status</th>
                <th className="px-4 py-2 border-b">Created At</th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b">ord_—</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b">paid</td>
                <td className="px-4 py-2 border-b">—</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    );
  }
  