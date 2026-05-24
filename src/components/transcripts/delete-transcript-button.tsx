"use client";

import { useFormStatus } from "react-dom";

type DeleteTranscriptButtonProps = {
  action: (formData: FormData) => void | Promise<void>;
  studentName: string;
  transcriptId: string;
};

function DeleteButtonLabel({ studentName }: { studentName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Delete transcript queue record for ${studentName}`}
      title="Delete transcript queue record"
      className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-200 bg-white text-lg font-semibold leading-none text-red-600 transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "..." : <span aria-hidden="true">&times;</span>}
    </button>
  );
}

export function DeleteTranscriptButton({ action, studentName, transcriptId }: DeleteTranscriptButtonProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete the transcript queue record for ${studentName}? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="transcriptId" value={transcriptId} />
      <DeleteButtonLabel studentName={studentName} />
    </form>
  );
}
