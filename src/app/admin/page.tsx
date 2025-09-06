// src/app/admin/page.tsx
import Link from "next/link";

export default function AdminHome() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      <p className="mb-8 text-gray-600">
        Internal-only dashboard for monitoring Gifty activity.
      </p>

      <nav className="space-y-4">
        <div>
          <Link
            href="/admin/overview"
            className="block p-4 bg-gray-100 rounded hover:bg-gray-200"
          >
            📊 Overview
          </Link>
        </div>
        <div>
          <Link
            href="/admin/merchants"
            className="block p-4 bg-gray-100 rounded hover:bg-gray-200"
          >
            🏪 Merchants
          </Link>
        </div>
        <div>
          <Link
            href="/admin/gift-cards"
            className="block p-4 bg-gray-100 rounded hover:bg-gray-200"
          >
            🎁 Gift Cards
          </Link>
        </div>
        <div>
          <Link
            href="/admin/transactions"
            className="block p-4 bg-gray-100 rounded hover:bg-gray-200"
          >
            💰 Transactions
          </Link>
        </div>
      </nav>
    </main>
  );
}
