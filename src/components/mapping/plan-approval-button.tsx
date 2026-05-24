"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

type PlanApprovalButtonProps = {
  formId?: string;
  isPlanApproved: boolean;
  canFinalize: boolean;
};

type ApprovalUiState = {
  label: string;
  disabled: boolean;
  className: string;
};

function computeApprovalUiState(
  isPlanApproved: boolean,
  canFinalize: boolean,
  isDirty: boolean,
): ApprovalUiState {
  if (isPlanApproved) {
    if (isDirty) {
      return {
        label: "Draft",
        disabled: true,
        className: "border border-amber-300 bg-amber-50 text-amber-900",
      };
    }

    return {
      label: "Approved",
      disabled: true,
      className: "border border-emerald-700 bg-emerald-700 text-white",
    };
  }

  if (canFinalize && !isDirty) {
    return {
      label: "Approve Plan",
      disabled: false,
      className: "border border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700",
    };
  }

  return {
    label: "Draft",
    disabled: true,
    className: "border border-slate-300 bg-slate-100 text-slate-500",
  };
}

export function PlanApprovalButton({ formId, isPlanApproved, canFinalize }: PlanApprovalButtonProps) {
  const { pending } = useFormStatus();
  const stateKey = `${formId ?? "none"}:${isPlanApproved}:${canFinalize}`;
  const [dirtyState, setDirtyState] = useState({ stateKey, isDirty: false });
  const isDirty = dirtyState.stateKey === stateKey ? dirtyState.isDirty : false;

  useEffect(() => {
    const onStateChange = (event: Event) => {
      if (!formId) {
        return;
      }

      const customEvent = event as CustomEvent<{ formId: string; isDirty: boolean }>;
      if (!customEvent.detail || customEvent.detail.formId !== formId) {
        return;
      }

      setDirtyState({
        stateKey,
        isDirty: customEvent.detail.isDirty,
      });
    };

    window.addEventListener("mapping-form-state-change", onStateChange);
    return () => {
      window.removeEventListener("mapping-form-state-change", onStateChange);
    };
  }, [formId, stateKey]);

  const uiState = computeApprovalUiState(isPlanApproved, canFinalize, isDirty);
  const label = pending ? (isPlanApproved ? "Updating..." : "Approving...") : uiState.label;

  return (
    <button
      type="submit"
      disabled={uiState.disabled || pending}
      className={`inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-semibold tracking-wide shadow-sm transition disabled:opacity-100 ${uiState.className}`}
    >
      {label}
    </button>
  );
}
