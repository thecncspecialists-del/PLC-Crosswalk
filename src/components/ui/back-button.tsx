"use client";

import Link from "next/link";

type BackButtonProps = {
  fallbackHref: string;
  label?: string;
  className?: string;
};

export function BackButton({
  fallbackHref,
  label = "Back",
  className = "justify-self-start inline-flex h-10 items-center gap-2 whitespace-nowrap rounded border border-slate-400 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 hover:shadow",
}: BackButtonProps) {
  return (
    <Link href={fallbackHref} className={className}>
      <span aria-hidden="true" className="text-base leading-none">
        &larr;
      </span>
      <span>{label}</span>
    </Link>
  );
}
