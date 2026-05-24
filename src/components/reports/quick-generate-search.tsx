"use client";

import { FormEvent, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type QuickGenerateSearchProps = {
  initialQuery: string;
};

export function QuickGenerateSearch({ initialQuery }: QuickGenerateSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    const nextUrl = trimmed.length > 0 ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname;

    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md items-center gap-2">
      <input
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search student, ref, institution, transcript ID..."
        className="h-9 w-full rounded border border-slate-300 px-3 text-sm"
      />
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        disabled={isPending}
      >
        {isPending ? "Searching..." : "Search"}
      </button>
    </form>
  );
}
