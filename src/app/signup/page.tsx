'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      // Depending on your Supabase email confirmation settings, the user may need to confirm via email.
      // We'll send them to the callback route to complete the session if auto-confirm is on,
      // otherwise show a message.
      router.replace('/auth/callback?next=' + encodeURIComponent(next));
    } catch (e: any) {
      setErr(e.message || 'Sign-up failed');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-gray-600">Sign up to start selling or buying gift cards.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="grid gap-1">
            <span className="text-sm text-gray-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="you@business.com"
              autoComplete="email"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-700">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-700">Confirm password</span>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>

          <button
            className="w-full rounded-lg p-3 bg-black text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Creating…' : 'Create account'}
          </button>

          {err && <p className="text-red-600 text-sm">{err}</p>}
        </form>

        <div className="text-sm text-center">
          Already have an account?{' '}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
