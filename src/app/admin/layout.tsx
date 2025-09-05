// src/app/admin/layout.tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <nav className="text-sm">
            <a href="/admin/commissions" className="hover:underline">Commissions</a>
          </nav>
        </header>
        <main>{children}</main>
      </div>
    );
  }
  