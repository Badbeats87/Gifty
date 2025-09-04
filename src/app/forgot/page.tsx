'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      setSent(true);
    } catch (e: any) {
      setErr(e.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Forgot password</h1>
          <p className="text-sm text-gray-600">We’ll email you a link to reset it.</p>
        </div>

        {sent ? (
          <div className="rounded-lg border p-4 bg-green-50">
            <p>Check your inbox for a password reset link.</p>
          </div>
        ) : (
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

            <button
              className="w-full rounded-lg p-3 bg-black text-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            {err && <p className="text-red-600 text-sm">{err}</p>}
          </form>
        )}

        <div className="text-sm text-center">
          <Link href="/login" className="underline">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
