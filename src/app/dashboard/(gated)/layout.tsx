// src/app/dashboard/(gated)/layout.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * Gate all /dashboard routes behind auth.
 * This is a Server Component layout.
 */
export default async function DashboardGatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/");
  }

  return <>{children}</>;
}
