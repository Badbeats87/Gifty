// src/app/admin/(gated)/layout.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

export default async function AdminGatedLayout({ children }: { children: ReactNode }) {
  // Only the gated area checks auth; /admin/login stays public.
  const authed = (await cookies()).get("admin_ok")?.value === "1";
  if (!authed) {
    redirect("/admin/login");
  }
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <nav className="text-sm space-x-4">
          <Link href="/admin/commissions" className="hover:underline">Commissions</Link>
          <Link href="/admin/logout" className="hover:underline">Log out</Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
