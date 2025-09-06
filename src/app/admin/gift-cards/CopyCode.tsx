// src/app/admin/gift-cards/CopyCode.tsx
"use client";

import { useState } from "react";

export default function CopyCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="text-blue-600 hover:underline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // noop
        }
      }}
      aria-label="Copy gift code"
    >
      {copied ? "Copied!" : "Copy code"}
    </button>
  );
}
