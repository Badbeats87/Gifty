'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = supabaseBrowser();
        await supabase.auth.signOut();
      } catch {
        // ignore errors; we’ll still redirect
      } finally {
        // send them home after sign-out
        router.replace('/');
      }
    };
    run();
  }, [router]);

  // simple, non-intrusive placeholder
  return (
    <div className="p-6">
      <p>Signing you out…</p>
    </div>
  );
}
