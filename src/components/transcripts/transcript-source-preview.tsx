"use client";

import { useMemo, useState } from "react";

type TranscriptFileOption = {
  id: string | null;
  fileName: string;
  uploadedAt: string;
};

type TranscriptSourcePreviewProps = {
  transcriptId: string;
  transcriptLabel: string;
  files: TranscriptFileOption[];
  defaultFileId: string | null;
  helperText: string;
  stackHeightClass?: string;
};

function fileUrl(transcriptId: string, fileId: string | null) {
  return fileId
    ? `/api/transcripts/${transcriptId}/file?fileId=${encodeURIComponent(fileId)}`
    : `/api/transcripts/${transcriptId}/file`;
}

export function TranscriptSourcePreview({
  transcriptId,
  transcriptLabel,
  files,
  defaultFileId,
  helperText,
  stackHeightClass,
}: TranscriptSourcePreviewProps) {
  const initialFileId = defaultFileId ?? files[0]?.id ?? null;
  const [selectedFileId, setSelectedFileId] = useState(initialFileId);
  const previewUrl = useMemo(() => fileUrl(transcriptId, selectedFileId), [selectedFileId, transcriptId]);

  if (files.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No transcript PDF is available for preview.
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white ${stackHeightClass ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Uploaded Transcript Preview</h2>
          <p className="text-xs text-slate-600">{helperText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {files.length > 1 ? (
            <select
              value={selectedFileId ?? ""}
              onChange={(event) => setSelectedFileId(event.target.value || null)}
              className="h-8 max-w-64 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
              aria-label="Transcript PDF"
            >
              {files.map((file) => (
                <option key={file.id ?? "default"} value={file.id ?? ""}>
                  {file.fileName}
                </option>
              ))}
            </select>
          ) : null}
          <a
            href={previewUrl}
            target="_blank"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open PDF
          </a>
        </div>
      </div>
      <iframe src={previewUrl} title={`${transcriptLabel} transcript preview`} className="block min-h-0 w-full flex-1 bg-slate-50" />
    </div>
  );
}
