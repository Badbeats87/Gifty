'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type Biz = { id: string; name: string; slug: string; logo_url?: string };

export default function Dashboard() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [message, setMessage] = useState('');
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (!u) {
        window.location.href = '/login';
        return;
      }
      setEmail(u.email ?? null);
      await loadBusinesses();
    });
  }, []);

  async function loadBusinesses() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.from('businesses').select('id,name,slug,logo_url').order('created_at');
    setBusinesses(data || []);
  }

  async function createBusiness(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    const supabase = supabaseBrowser();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setMessage('Not signed in');
      return;
    }
    const normSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    const { error } = await supabase.from('businesses').insert([
      { owner_user_id: userData.user.id, name: name.trim(), slug: normSlug },
    ]);
    if (error) setMessage(`Error: ${error.message}`);
    else {
      setMessage(`Created business: ${name} (${normSlug})`);
      setName('');
      setSlug('');
      await loadBusinesses();
    }
  }

  async function uploadLogo(bizId: string, file: File) {
    try {
      setUploading(bizId);
      const supabase = supabaseBrowser();

      const filePath = `${bizId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('logos').upload(filePath, file, {
        upsert: true,
      });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      const { error: updateErr } = await supabase.from('businesses').update({ logo_url: publicUrl }).eq('id', bizId);
      if (updateErr) throw updateErr;

      await loadBusinesses();
    } catch (e: any) {
      setMessage(e.message || 'Failed to upload logo');
    } finally {
      setUploading(null);
    }
  }

  async function logout() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (!email) return <div className="p-6">Checking session…</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm">
            Signed in as <strong>{email}</strong>
          </p>
        </div>
        <button onClick={logout} className="border rounded-lg px-3 py-2">
          Log out
        </button>
      </div>

      <form onSubmit={createBusiness} className="space-y-3">
        <input
          type="text"
          placeholder="Business name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-lg p-3"
          required
        />
        <input
          type="text"
          placeholder="slug (e.g. my-cafe)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full border rounded-lg p-3"
          required
        />
        <button className="bg-black text-white rounded-lg p-3">Create Business</button>
      </form>
      {message && <p>{message}</p>}

      {businesses.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Your businesses</h2>
          <ul className="space-y-2">
            {businesses.map((b) => (
              <li key={b.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-3">
                  {b.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logo_url} alt="Logo" className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-12 bg-gray-200 rounded" />
                  )}
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-sm text-gray-600">
                      <code>{b.slug}</code>
                    </div>
                  </div>
                </div>
                <label className="block">
                  <span className="text-sm text-gray-600">Upload/replace logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm"
                    onChange={(e) => {
                      if (e.target.files?.[0]) uploadLogo(b.id, e.target.files[0]);
                    }}
                    disabled={uploading === b.id}
                  />
                </label>
                {uploading === b.id && <p>Uploading…</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
