"use client";

import { useState } from "react";

type TranscriptPreviewButtonProps = {
  transcriptId: string;
  transcriptLabel: string;
};

export function TranscriptPreviewButton({ transcriptId, transcriptLabel }: TranscriptPreviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const previewUrl = `/api/transcripts/${transcriptId}/file`;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 items-center rounded border border-slate-400 bg-slate-50 px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
      >
        Preview Transcript
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid bg-slate-950/60 p-4">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-900">Transcript Preview</h2>
                <p className="truncate text-xs text-slate-500">{transcriptLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 items-center rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <iframe src={previewUrl} title={`${transcriptLabel} preview`} className="min-h-0 flex-1 bg-slate-50" />
          </div>
        </div>
      ) : null}
    </>
  );
}
