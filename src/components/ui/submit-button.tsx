"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  "aria-describedby"?: string;
  className?: string;
  disabled?: boolean;
  form?: string;
  pendingLabel?: string;
  title?: string;
};

export function SubmitButton({
  "aria-describedby": ariaDescribedBy,
  children,
  className,
  disabled,
  form,
  pendingLabel = "Working...",
  title,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      aria-describedby={ariaDescribedBy}
      form={form}
      disabled={isDisabled}
      className={className ?? "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"}
      title={title}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
