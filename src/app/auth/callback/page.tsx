'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState('Finishing sign-in...');
  const next = params.get('next') || '/dashboard';

  useEffect(() => {
    const run = async () => {
      const supabase = supabaseBrowser();
      const url = new URL(window.location.href);
      const hasCode = !!url.searchParams.get('code');

      try {
        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) throw error;
          setStatus('Signed in! Redirecting...');
          router.replace(next);
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          setStatus('Signed in! Redirecting...');
          router.replace(next);
          return;
        }
        setStatus('Could not complete sign-in. Please request a new link.');
      } catch (e: any) {
        setStatus(`Error: ${e.message}`);
      }
    };
    run();
  }, [router, next]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p>{status}</p>
    </div>
  );
}
