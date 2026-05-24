"use client";

import { useState } from "react";

type CopyFieldButtonProps = {
  value: string;
  label: string;
};

export function CopyFieldButton({ value, label }: CopyFieldButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1200);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Copy
      </button>
      <span className="text-xs text-slate-500">
        {status === "copied" ? `${label} copied` : status === "failed" ? "Clipboard blocked" : ""}
      </span>
    </div>
  );
}
