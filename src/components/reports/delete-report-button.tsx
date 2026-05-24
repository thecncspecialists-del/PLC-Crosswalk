"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DeleteReportButtonProps = {
  reportId: string;
};

export function DeleteReportButton({ reportId }: DeleteReportButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm("Delete this generated report? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error(`Delete failed with status ${response.status}`);
      }

      router.refresh();
    } catch {
      setError("Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        aria-label="Delete report"
        title="Delete report"
        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        &times;
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
