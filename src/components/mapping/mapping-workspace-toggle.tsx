"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useMappingDirtyGuard } from "@/components/mapping/mapping-dirty-guard";

type MappingWorkspaceToggleProps = {
  mappingPane: ReactNode;
  previewPane: ReactNode;
  initialView?: "mapping" | "preview";
};

export function MappingWorkspaceToggle({
  mappingPane,
  previewPane,
  initialView = "mapping",
}: MappingWorkspaceToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { confirmDiscardChanges } = useMappingDirtyGuard();
  const activeView = searchParams.get("workspace") === "preview" ? "preview" : initialView;
  const tabSetId = useId();
  const mappingButtonRef = useRef<HTMLButtonElement | null>(null);
  const previewButtonRef = useRef<HTMLButtonElement | null>(null);

  const mappingTabId = `${tabSetId}-mapping-tab`;
  const previewTabId = `${tabSetId}-preview-tab`;
  const mappingPanelId = `${tabSetId}-mapping-panel`;
  const previewPanelId = `${tabSetId}-preview-panel`;

  function setView(nextView: "mapping" | "preview") {
    if (nextView === activeView) {
      return true;
    }

    if (!confirmDiscardChanges()) {
      return false;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (nextView === "preview") {
      params.set("workspace", "preview");
    } else {
      params.delete("workspace");
    }
    const nextQuery = params.toString();

    startTransition(() => {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    });
    return true;
  }

  function focusTab(view: "mapping" | "preview") {
    if (view === "mapping") {
      mappingButtonRef.current?.focus();
      return;
    }
    previewButtonRef.current?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentView: "mapping" | "preview") {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const nextView = currentView === "mapping" ? "preview" : "mapping";
      if (setView(nextView)) {
        focusTab(nextView);
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (setView("mapping")) {
        focusTab("mapping");
      }
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (setView("preview")) {
        focusTab("preview");
      }
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex justify-center">
        <div
          role="tablist"
          aria-label="Mapping workspace view"
          className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-slate-100 p-1"
        >
          <button
            id={mappingTabId}
            ref={mappingButtonRef}
            type="button"
            onClick={() => setView("mapping")}
            onKeyDown={(event) => onTabKeyDown(event, "mapping")}
            disabled={isPending}
            role="tab"
            tabIndex={activeView === "mapping" ? 0 : -1}
            aria-controls={mappingPanelId}
            aria-selected={activeView === "mapping"}
            className={`inline-flex h-full min-w-36 items-center justify-center rounded-md px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
              activeView === "mapping"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:bg-slate-200 hover:text-slate-800"
            } ${isPending ? "cursor-not-allowed opacity-70" : ""}`}
          >
            Catalog Mapping
          </button>
          <button
            id={previewTabId}
            ref={previewButtonRef}
            type="button"
            onClick={() => setView("preview")}
            onKeyDown={(event) => onTabKeyDown(event, "preview")}
            disabled={isPending}
            role="tab"
            tabIndex={activeView === "preview" ? 0 : -1}
            aria-controls={previewPanelId}
            aria-selected={activeView === "preview"}
            className={`inline-flex h-full min-w-36 items-center justify-center rounded-md px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
              activeView === "preview"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:bg-slate-200 hover:text-slate-800"
            } ${isPending ? "cursor-not-allowed opacity-70" : ""}`}
          >
            Transcript Preview
          </button>
        </div>
      </div>

      <div
        id={mappingPanelId}
        role="tabpanel"
        aria-labelledby={mappingTabId}
        hidden={activeView !== "mapping"}
        className={activeView === "mapping" ? "block" : "hidden"}
      >
        {mappingPane}
      </div>
      <div
        id={previewPanelId}
        role="tabpanel"
        aria-labelledby={previewTabId}
        hidden={activeView !== "preview"}
        className={activeView === "preview" ? "block" : "hidden"}
      >
        {previewPane}
      </div>
    </div>
  );
}
