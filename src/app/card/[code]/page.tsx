import { supabaseServer } from '@/lib/supabase';
import Link from 'next/link';

type Props = { params: { code: string } };

export default async function CardPage({ params }: Props) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.rpc('get_gift_card_public', { p_code: params.code });

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Error</h1>
        <p className="text-red-600">{error.message}</p>
        <Link href="/" className="underline">Go home</Link>
      </div>
    );
  }

  const gc = Array.isArray(data) ? data[0] : data;

  if (!gc) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Gift card not found</h1>
        <p className="text-gray-600">Code: <code className="font-mono">{params.code}</code></p>
        <Link href="/" className="underline">Go home</Link>
      </div>
    );
  }

  const dollars = (gc.remaining_amount_cents / 100).toFixed(2);

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{gc.business_name} — Gift Card</h1>

      <div className="rounded-2xl border p-4 space-y-2">
        <p><strong>Code:</strong> <code className="font-mono">{gc.code}</code></p>
        <p><strong>Balance:</strong> ${dollars} {gc.currency?.toUpperCase?.() ?? 'USD'}</p>
        <p><strong>Status:</strong> {gc.status}</p>
        {gc.expires_at && (
          <p><strong>Expires:</strong> {new Date(gc.expires_at).toLocaleString()}</p>
        )}
      </div>

      <p className="text-sm text-gray-500">
        Keep this code safe. Show it in person at the business to redeem.
      </p>

      <Link href="/" className="underline text-sm">Back to home</Link>
    </div>
  );
}
