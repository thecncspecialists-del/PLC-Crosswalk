"use client";

import { useEffect, useState } from "react";

type MappingFormSubmitButtonProps = {
  formId: string;
  children?: string;
};

export function MappingFormSubmitButton({ formId, children = "Accept Mapping" }: MappingFormSubmitButtonProps) {
  const [submitState, setSubmitState] = useState({ formId, canSubmit: false });
  const canSubmit = submitState.formId === formId ? submitState.canSubmit : false;

  useEffect(() => {
    const onStateChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId: string; isDirty: boolean; canAcceptMapping: boolean }>;
      if (!customEvent.detail || customEvent.detail.formId !== formId) {
        return;
      }
      setSubmitState({
        formId,
        canSubmit: customEvent.detail.isDirty && customEvent.detail.canAcceptMapping,
      });
    };

    window.addEventListener("mapping-form-state-change", onStateChange);
    return () => {
      window.removeEventListener("mapping-form-state-change", onStateChange);
    };
  }, [formId]);

  return (
    <button
      type="submit"
      form={formId}
      disabled={!canSubmit}
      className="inline-flex h-10 w-full items-center justify-center rounded bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
    >
      {children}
    </button>
  );
}
