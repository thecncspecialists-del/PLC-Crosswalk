"use client";

import { useRef } from "react";

type ProgramOption = {
  id: string;
  name: string;
};

type ProgramSelectFormProps = {
  transcriptId: string;
  selectedProgramId: string | null;
  programs: ProgramOption[];
  changeWarningMessage?: string | null;
  action: (formData: FormData) => void | Promise<void>;
};

export function ProgramSelectForm({
  transcriptId,
  selectedProgramId,
  programs,
  changeWarningMessage,
  action,
}: ProgramSelectFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <form ref={formRef} action={action} className="grid gap-1">
      <input type="hidden" name="transcriptId" value={transcriptId} />
      <select
        name="programId"
        defaultValue={selectedProgramId ?? ""}
        onChange={(event) => {
          const nextProgramId = event.currentTarget.value;
          const isProgramSwitch = Boolean(selectedProgramId) && nextProgramId !== selectedProgramId;
          if (isProgramSwitch && changeWarningMessage) {
            const approved = window.confirm(changeWarningMessage);
            if (!approved) {
              event.currentTarget.value = selectedProgramId ?? "";
              return;
            }
          }

          formRef.current?.requestSubmit();
        }}
        className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900"
      >
        <option value="" disabled>
          Select program...
        </option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>
            {program.name}
          </option>
        ))}
      </select>
      <p className="text-[10px] leading-4 text-slate-500">Selecting a program updates the catalog immediately.</p>
    </form>
  );
}
