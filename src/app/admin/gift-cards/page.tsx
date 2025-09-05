// src/app/admin/gift-cards/page.tsx
export default function AdminGiftCards() {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold mb-6">🎁 Gift Cards</h1>
  
        {/* Filters (placeholder) */}
        <section className="mb-6 flex flex-wrap gap-3">
          <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
            Status: All
          </button>
          <button className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
            Merchant: All
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
                <th className="px-4 py-2 border-b">Code</th>
                <th className="px-4 py-2 border-b">Merchant</th>
                <th className="px-4 py-2 border-b">Amount (USD)</th>
                <th className="px-4 py-2 border-b">Status</th>
                <th className="px-4 py-2 border-b">Issued At</th>
                <th className="px-4 py-2 border-b">Redeemed At</th>
                <th className="px-4 py-2 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b">ABCD•••1234</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b">Issued</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b">—</td>
                <td className="px-4 py-2 border-b text-blue-600">
                  Copy · Void · Open
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    );
  }
  