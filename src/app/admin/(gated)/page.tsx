// src/app/admin/page.tsx
export default function AdminHome() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <h2 className="text-xl font-semibold">Admin dashboard</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <a className="text-blue-600 hover:underline" href="/admin/commissions">
            Commissions (overrides & recent fees)
          </a>
        </li>
        <li>
          <a className="text-blue-600 hover:underline" href="/admin/logout">
            Log out
          </a>
        </li>
      </ul>
    </div>
  );
}
