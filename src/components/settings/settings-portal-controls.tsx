"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  SettingsPortalPageSize,
  SettingsPortalSort,
  SettingsPortalTable,
} from "@/lib/settings-db-tools";

type SettingsPortalControlsProps = {
  table: SettingsPortalTable;
  pageSize: SettingsPortalPageSize;
  sort: SettingsPortalSort;
  filter: string;
  tableOptions: Array<{
    value: SettingsPortalTable;
    label: string;
  }>;
  pageSizeOptions: readonly SettingsPortalPageSize[];
};

export function SettingsPortalControls({
  table,
  pageSize,
  sort,
  filter,
  tableOptions,
  pageSizeOptions,
}: SettingsPortalControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const filterRef = useRef<HTMLInputElement | null>(null);

  function navigate(next: {
    table?: SettingsPortalTable;
    pageSize?: SettingsPortalPageSize;
    sort?: SettingsPortalSort;
    filter?: string;
  }) {
    const nextTable = next.table ?? table;
    const nextPageSize = next.pageSize ?? pageSize;
    const nextSort = next.sort ?? sort;
    const nextFilter = (next.filter ?? filterRef.current?.value ?? filter).trim().slice(0, 120);

    const currentTable = (searchParams.get("table") ?? table) as SettingsPortalTable;
    const currentPageSize = Number(searchParams.get("pageSize") ?? String(pageSize)) as SettingsPortalPageSize;
    const currentSort = (searchParams.get("sort") ?? sort) as SettingsPortalSort;
    const currentFilter = (searchParams.get("filter") ?? filter).trim();

    if (
      currentTable === nextTable &&
      currentPageSize === nextPageSize &&
      currentSort === nextSort &&
      currentFilter === nextFilter
    ) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("table", nextTable);
    params.set("page", "1");
    params.set("pageSize", String(nextPageSize));
    params.set("sort", nextSort);

    if (nextFilter.length > 0) {
      params.set("filter", nextFilter);
    } else {
      params.delete("filter");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function applyFilter() {
    navigate({ filter: filterRef.current?.value ?? filter });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs text-slate-600">
        Table
        <select
          name="table"
          value={table}
          disabled={isPending}
          onChange={(event) => {
            navigate({
              table: event.currentTarget.value as SettingsPortalTable,
            });
          }}
          className="h-9 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800"
        >
          {tableOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        Sort
        <select
          name="sort"
          value={sort}
          disabled={isPending}
          onChange={(event) => {
            navigate({
              sort: event.currentTarget.value as SettingsPortalSort,
            });
          }}
          className="h-9 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800"
        >
          <option value="default">Default</option>
          <option value="asc">A to Z</option>
          <option value="desc">Z to A</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        Page Size
        <select
          name="pageSize"
          value={String(pageSize)}
          disabled={isPending}
          onChange={(event) => {
            navigate({
              pageSize: Number(event.currentTarget.value) as SettingsPortalPageSize,
            });
          }}
          className="h-9 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        Filter
        <input
          key={`${table}:${filter}`}
          ref={filterRef}
          name="filter"
          defaultValue={filter}
          disabled={isPending}
          onBlur={applyFilter}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyFilter();
            }
          }}
          placeholder="Filter visible rows..."
          className="h-9 w-40 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800"
        />
      </label>
      {isPending ? <span className="h-9 self-end px-1 text-xs text-slate-500">Updating...</span> : null}
    </div>
  );
}
