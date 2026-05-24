"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  form?: string;
  pendingLabel?: string;
};

export function SubmitButton({ children, className, disabled, form, pendingLabel = "Working..." }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      form={form}
      disabled={isDisabled}
      className={className ?? "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
