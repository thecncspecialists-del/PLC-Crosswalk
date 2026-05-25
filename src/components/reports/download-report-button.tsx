"use client";

import { useState } from "react";

type DownloadReportButtonProps = {
  reportId: string;
  format?: "ADMIN" | "STUDENT";
  className?: string;
};

function parseFileName(contentDispositionHeader: string | null, reportId: string, format?: "ADMIN" | "STUDENT") {
  if (!contentDispositionHeader) {
    return `${format?.toLowerCase() ?? "report"}-${reportId}.pdf`;
  }

  const fileNameMatch = contentDispositionHeader.match(/filename="([^"]+)"/i);
  return fileNameMatch?.[1] ?? `${format?.toLowerCase() ?? "report"}-${reportId}.pdf`;
}

export function DownloadReportButton({ reportId, format, className }: DownloadReportButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "GET",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const fileName = parseFileName(response.headers.get("content-disposition"), reportId, format);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Download failed");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className={className ?? "underline text-slate-800 disabled:opacity-50"}
      >
        {isDownloading ? "Downloading..." : "Download"}
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
