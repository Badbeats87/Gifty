// src/app/dashboard/layout.tsx
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Server-side auth check for ALL /dashboard routes
  const supabase = supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    // send them to login and come back to /dashboard
    redirect(`/login?next=${encodeURIComponent("/dashboard")}`);
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Business dashboard</h1>
        <nav className="text-sm space-x-4">
          <a className="hover:underline" href="/dashboard">Home</a>
          <a className="hover:underline" href="/dashboard/history">History</a>
          <a className="hover:underline" href="/dashboard/redeem">Redeem</a>
          <a className="hover:underline" href="/logout">Log out</a>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
