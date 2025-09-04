'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase automatically sets a temporary session when user clicks reset link
    const run = async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setErr('Reset link is invalid or expired. Try again.');
      }
    };
    run();
  }, []);

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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.replace('/dashboard'), 1500);
    } catch (e: any) {
      setErr(e.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold">Reset Password</h1>

        {done ? (
          <p className="text-green-600">Password updated! Redirecting…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="grid gap-1">
              <span className="text-sm text-gray-700">New password</span>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border rounded-lg p-3 pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600 underline"
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-gray-700">Confirm password</span>
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border rounded-lg p-3"
                placeholder="••••••••"
              />
            </label>

            <button
              className="w-full rounded-lg p-3 bg-black text-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>

            {err && <p className="text-red-600 text-sm">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
