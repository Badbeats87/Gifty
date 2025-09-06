// src/app/admin/layout.tsx
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Gifty — Admin",
};

/**
 * Full-screen overlay admin layout
 * - Fixed, inset-0, high z-index: completely covers the public site UI.
 * - Own scroll container to avoid double scrollbars.
 * - Clean light background; no bleed from the marketing layout.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] bg-gray-100 overflow-y-auto">
      <div className="min-h-full flex">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-64 flex-col border-r bg-white">
          <div className="px-5 py-4 border-b">
            <Link href="/admin" className="block">
              <span className="text-xl font-bold text-gray-900">Gifty Admin</span>
            </Link>
            <p className="text-xs text-gray-600 mt-1">Internal dashboard</p>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            <NavItem href="/admin/overview" label="Overview" emoji="📊" />
            <NavItem href="/admin/merchants" label="Merchants" emoji="🏪" />
            <NavItem href="/admin/gift-cards" label="Gift Cards" emoji="🎁" />
            <NavItem href="/admin/transactions" label="Transactions" emoji="💰" />
          </nav>

          <div className="p-4 border-t text-xs text-gray-500">v0 — MVP</div>
        </aside>

        {/* Main column */}
        <div className="flex-1 flex flex-col bg-white">
          {/* ADMIN AREA BANNER */}
          <div className="w-full bg-yellow-100 border-b border-yellow-300 text-yellow-900 px-6 py-3 text-sm">
            <strong>ADMIN AREA:</strong> Internal-only tools. If you don’t see this banner, you’re not in <code>/admin/*</code>.
          </div>

          {/* Top bar */}
          <div className="hidden md:flex items-center justify-between px-6 py-4 border-b bg-white">
            <div className="text-sm text-gray-600">Internal-only · No merchant access</div>
            <div className="text-sm text-gray-400">v0</div>
          </div>

          {/* Content */}
          <main className="flex-1">
            <div className="max-w-6xl mx-auto w-full px-6 py-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  href,
  label,
  emoji,
}: {
  href: string;
  label: string;
  emoji: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-50 text-gray-900"
    >
      <span className="text-base">{emoji}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
