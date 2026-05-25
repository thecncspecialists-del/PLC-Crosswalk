"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { formatMiCredits, hoursToMiCredits } from "@/lib/mi-hours";

type CatalogCourse = {
  id: string;
  code: string;
  title: string;
  creditHours: number | null;
};

type DecisionSelection = {
  programCourseId: string;
  awardedCredits: number | null;
};

type DecisionEvidence = {
  id: string;
  kind: string;
  snippet: string;
  sourceRef?: string | null;
};

type MappingCourseEditorProps = {
  formId?: string;
  hideInlineSubmit?: boolean;
  transcriptId: string;
  externalCourse: {
    id: string;
    courseCode: string | null;
    title: string;
    credits: number | null;
    grade: string | null;
    termLabel: string | null;
  };
  decision: {
    status: "UNREVIEWED" | "MAPPED" | "NO_CREDIT" | "CREDIT_ONLY";
    rationale: string | null;
    selections: DecisionSelection[];
    evidence: DecisionEvidence[];
  };
  catalogCourses: CatalogCourse[];
  lockedCatalogCourseIds: string[];
  lockedReasonByCourseId?: Record<string, string>;
  stackHeightClass?: string;
  saveMappingAction: (formData: FormData) => void | Promise<void>;
};

function sanitizeNumber(value: string) {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function buildComparableCreditsByCourse(courseIds: string[], creditsByCourse: Record<string, string>) {
  const comparable: Record<string, string> = {};
  for (const courseId of [...courseIds].sort()) {
    comparable[courseId] = creditsByCourse[courseId] ?? "";
  }
  return comparable;
}

export function MappingCourseEditor({
  formId,
  hideInlineSubmit = false,
  transcriptId,
  externalCourse,
  decision,
  catalogCourses,
  lockedCatalogCourseIds,
  lockedReasonByCourseId,
  stackHeightClass,
  saveMappingAction,
}: MappingCourseEditorProps) {
  const initialSelectedIds = useMemo(
    () => decision.selections.map((selection) => selection.programCourseId),
    [decision.selections],
  );
  const initialCreditsByCourse = useMemo(() => {
    const startingState: Record<string, string> = {};
    for (const selection of decision.selections) {
      startingState[selection.programCourseId] =
        selection.awardedCredits == null ? "" : String(selection.awardedCredits);
    }
    return startingState;
  }, [decision.selections]);
  const initialRationaleText = decision.rationale ?? "";
  const initialEvidenceNoteText =
    decision.evidence.find((evidence) => evidence.sourceRef === "reviewer-evidence-note")?.snippet ??
    decision.evidence.find(
      (evidence) => evidence.kind === "ADMIN_NOTE" && evidence.snippet.trim() !== (decision.rationale ?? "").trim(),
    )?.snippet ??
    "";

  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedProgramCourseIds, setSelectedProgramCourseIds] = useState<string[]>(initialSelectedIds);
  const [awardedCreditsByCourse, setAwardedCreditsByCourse] =
    useState<Record<string, string>>(initialCreditsByCourse);
  const [rationaleText, setRationaleText] = useState(initialRationaleText);
  const [evidenceNoteText, setEvidenceNoteText] = useState(initialEvidenceNoteText);
  const lockedCatalogCourseIdSet = useMemo(() => new Set(lockedCatalogCourseIds), [lockedCatalogCourseIds]);
  const catalogScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const visibleCourses = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) {
      return catalogCourses;
    }

    return catalogCourses.filter((course) => {
      const haystack = `${course.code} ${course.title}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [catalogCourses, catalogSearch]);

  function toggleSelection(course: CatalogCourse) {
    setSelectedProgramCourseIds((previous) => {
      const exists = previous.includes(course.id);
      const isLocked = lockedCatalogCourseIdSet.has(course.id) && !exists;
      if (isLocked) {
        return previous;
      }

      if (exists) {
        const filtered = previous.filter((id) => id !== course.id);
        setAwardedCreditsByCourse((current) => {
          const copy = { ...current };
          delete copy[course.id];
          return copy;
        });
        return filtered;
      }

      setAwardedCreditsByCourse((current) => ({
        ...current,
        [course.id]: current[course.id] ?? (course.creditHours == null ? "" : String(course.creditHours)),
      }));
      return [...previous, course.id];
    });
  }

  const serializedCourseIds = JSON.stringify(selectedProgramCourseIds);
  const serializedCredits = JSON.stringify(
    Object.fromEntries(
      Object.entries(awardedCreditsByCourse).map(([courseId, credit]) => [courseId, sanitizeNumber(credit)]),
    ),
  );
  const editorStackHeightClass = stackHeightClass ?? "lg:h-[56rem]";
  const hasMappedSelection = selectedProgramCourseIds.length > 0;
  const hasInvalidSelectedCredit = selectedProgramCourseIds.some(
    (courseId) => sanitizeNumber(awardedCreditsByCourse[courseId] ?? "") == null,
  );
  const canAcceptMapping = hasMappedSelection ? !hasInvalidSelectedCredit : true;
  const initialSelectedIdsSortedKey = useMemo(() => [...initialSelectedIds].sort().join("|"), [initialSelectedIds]);
  const selectedIdsSortedKey = useMemo(
    () => [...selectedProgramCourseIds].sort().join("|"),
    [selectedProgramCourseIds],
  );
  const initialCreditsComparable = useMemo(
    () => buildComparableCreditsByCourse(initialSelectedIds, initialCreditsByCourse),
    [initialCreditsByCourse, initialSelectedIds],
  );
  const currentCreditsComparable = useMemo(
    () => buildComparableCreditsByCourse(selectedProgramCourseIds, awardedCreditsByCourse),
    [awardedCreditsByCourse, selectedProgramCourseIds],
  );
  const hasRationaleChanged = rationaleText !== initialRationaleText;
  const hasEvidenceChanged = evidenceNoteText !== initialEvidenceNoteText;
  const hasSelectionsChanged =
    selectedIdsSortedKey !== initialSelectedIdsSortedKey ||
    JSON.stringify(currentCreditsComparable) !== JSON.stringify(initialCreditsComparable);
  const isDirty = hasRationaleChanged || hasEvidenceChanged || hasSelectionsChanged;

  useEffect(() => {
    const container = catalogScrollContainerRef.current;
    if (!container) {
      return;
    }

    const firstMappedRow = container.querySelector('tr[data-course-state="mapped"]') as HTMLTableRowElement | null;
    if (!firstMappedRow) {
      container.scrollTop = 0;
      return;
    }

    const topOffset = firstMappedRow.offsetTop - 8;
    container.scrollTop = Math.max(topOffset, 0);
  }, [externalCourse.id]);

  useEffect(() => {
    if (!formId || typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("mapping-form-state-change", {
        detail: {
          formId,
          isDirty,
          canAcceptMapping,
        },
      }),
    );
  }, [formId, isDirty, canAcceptMapping]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <form
          id={formId}
          action={saveMappingAction}
          className={`flex min-w-0 flex-col gap-3 rounded border border-slate-200 bg-white p-4 ${editorStackHeightClass}`}
        >
          <input type="hidden" name="transcriptId" value={transcriptId} />
          <input type="hidden" name="externalCourseId" value={externalCourse.id} />
          <input type="hidden" name="selectedProgramCourseIds" value={serializedCourseIds} />
          <input type="hidden" name="creditAllocations" value={serializedCredits} />
          <input type="hidden" name="rationale" value={rationaleText} />
          <input type="hidden" name="evidenceNote" value={evidenceNoteText} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Map to Catalog Course(s)</h3>
            <input
              type="search"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              aria-label="Search selected program catalog"
              placeholder="Search selected program catalog..."
              className="w-full max-w-64 rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex h-[36rem] min-h-0 flex-col overflow-hidden rounded border border-slate-200 lg:h-auto lg:flex-1">
            <table className="w-full table-fixed border-b border-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-16 px-2 py-2">Select</th>
                  <th className="px-2 py-2">Course</th>
                  <th className="w-32 px-2 py-2">Hours</th>
                </tr>
              </thead>
            </table>

            <div ref={catalogScrollContainerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed text-sm">
                <tbody className="divide-y divide-slate-100">
                {visibleCourses.map((course) => {
                  const checked = selectedProgramCourseIds.includes(course.id);
                  const locked = lockedCatalogCourseIdSet.has(course.id) && !checked;
                  const lockReason = lockedReasonByCourseId?.[course.id];
                  const courseLabel = `${course.code} ${course.title}`;
                  const displayedHours = sanitizeNumber(awardedCreditsByCourse[course.id] ?? "") ?? course.creditHours;
                  const rowStyle = checked
                    ? "bg-emerald-100 ring-1 ring-emerald-300"
                    : locked
                      ? "bg-emerald-50/70"
                      : "";
                  const courseTextColor = checked ? "text-emerald-900" : "text-slate-900";
                  const checkboxClassName = locked
                    ? "h-4 w-4 rounded border-emerald-200 accent-emerald-300 opacity-70"
                    : checked
                      ? "h-4 w-4 rounded border-emerald-300 accent-emerald-600"
                      : "h-4 w-4 rounded border-slate-300 accent-slate-700";
                  return (
                    <tr
                      key={course.id}
                      data-course-state={checked ? "mapped" : "available"}
                      className={`h-20 ${rowStyle}`}
                      title={lockReason}
                    >
                      <td className="w-16 px-2 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => toggleSelection(course)}
                          aria-label={`Select ${courseLabel}`}
                          className={checkboxClassName}
                        />
                      </td>
                      <td className="min-w-0 px-2 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <p className={`min-w-0 flex-1 truncate font-medium ${courseTextColor}`}>{courseLabel}</p>
                          {checked ? (
                            <span className="whitespace-nowrap rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              Mapped
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="w-32 px-2 py-2 align-middle">
                        <input
                          inputMode="decimal"
                          value={awardedCreditsByCourse[course.id] ?? ""}
                          onChange={(event) =>
                            setAwardedCreditsByCourse((previous) => ({
                              ...previous,
                              [course.id]: event.target.value,
                            }))
                          }
                          disabled={!checked || locked}
                          aria-label={`Awarded hours for ${courseLabel}`}
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-100"
                          placeholder={course.creditHours == null ? "-" : String(course.creditHours)}
                        />
                        <p className="mt-1 text-[10px] font-medium text-slate-500">
                          {course.creditHours == null
                            ? "Credit equivalent: N/A"
                            : `Equivalent: ${formatMiCredits(
                                hoursToMiCredits(displayedHours),
                              )}`}
                        </p>
                      </td>
                    </tr>
                  );
                })}
                {visibleCourses.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-4 text-center text-xs text-slate-500">
                      No courses match this search.
                    </td>
                  </tr>
                ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <label className="text-xs font-medium text-slate-700">
            Mapping Rationale
            <textarea
              value={rationaleText}
              onChange={(event) => setRationaleText(event.target.value)}
              className="mt-1 min-h-20 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Evidence
            <textarea
              value={evidenceNoteText}
              onChange={(event) => setEvidenceNoteText(event.target.value)}
              className="mt-1 min-h-20 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>

          {!hideInlineSubmit ? (
            <SubmitButton
              disabled={!canAcceptMapping}
              className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Accept Mapping
            </SubmitButton>
          ) : null}
        </form>
      </div>
    </div>
  );
}
