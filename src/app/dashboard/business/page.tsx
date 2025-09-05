// src/app/dashboard/business/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type Business = {
  id: string;
  name: string | null;
  logo_url: string | null;
};

export default async function BusinessPage() {
  const supabase = await supabaseServer();

  // Ensure signed in (layout already gates, but keep this robust)
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    // If somehow unauthenticated, show a lightweight message.
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Business settings</h1>
        <p className="mt-2 text-gray-600">You are not signed in.</p>
        <p className="mt-6">
          <Link href="/dashboard" className="underline">
            Back to dashboard
          </Link>
        </p>
      </main>
    );
  }

  async function tryQuery(column?: string) {
    if (!column) {
      return await supabase
        .from("businesses")
        .select("id, name, logo_url")
        .limit(1)
        .single(); // relies on RLS to scope to viewer
    }
    return await supabase
      .from("businesses")
      .select("id, name, logo_url")
      .eq(column, user.id)
      .single();
  }

  const attempts = ["owner_id", "user_id", "created_by", undefined] as const;

  let business: Business | null = null;
  let lastError: any = null;

  for (const col of attempts) {
    const { data, error } = await tryQuery(col as any);
    if (!error) {
      business = data as Business;
      break;
    }
    // Known/noisy-but-ignorable errors:
    //  - 42703 = undefined_column
    //  - PGRST116 = No rows found for single()
    if (error?.code === "42703" || error?.code === "PGRST116") {
      lastError = error;
      continue;
    } else {
      lastError = error;
      break;
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Business settings</h1>

      {business ? (
        <div className="mt-4">
          {business.logo_url && (
            // use <img> to avoid next/image domain config during setup
            <img
              src={business.logo_url}
              alt={`${business.name ?? "Business"} logo`}
              width={80}
              height={80}
              className="rounded mb-4"
            />
          )}
          <p className="font-medium">{business.name ?? "Unnamed business"}</p>
        </div>
      ) : lastError?.code === "PGRST116" ? (
        <p className="mt-2 text-gray-600">No business found for your account.</p>
      ) : lastError ? (
        <p className="mt-2 text-red-600">
          Error: {lastError.message ?? "Failed to load business."}
        </p>
      ) : (
        <p className="mt-2 text-gray-600">No business found for your account.</p>
      )}

      <p className="mt-6">
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
