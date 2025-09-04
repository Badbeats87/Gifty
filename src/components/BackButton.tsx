"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
      aria-label="Go back"
      title="Go back"
    >
      ← Back
    </button>
  );
}
