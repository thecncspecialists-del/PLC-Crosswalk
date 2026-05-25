"use client";

import Link from "next/link";
import { useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { formatGrade } from "@/lib/grade-format";

type SelectedCourse = {
  id: string;
  courseCode: string | null;
  title: string;
  credits: number | null;
  grade: string | null;
  termLabel: string | null;
};

type SelectedExternalCoursePanelProps = {
  transcriptId: string;
  selectedCourse: SelectedCourse | null;
  isAddMode: boolean;
  cancelAddHref: string;
  updateExternalCourseAction: (formData: FormData) => void | Promise<void>;
  createExternalCourseAction: (formData: FormData) => void | Promise<void>;
  deleteExternalCourseAction: (formData: FormData) => void | Promise<void>;
};

export function SelectedExternalCoursePanel({
  transcriptId,
  selectedCourse,
  isAddMode,
  cancelAddHref,
  updateExternalCourseAction,
  createExternalCourseAction,
  deleteExternalCourseAction,
}: SelectedExternalCoursePanelProps) {
  const [courseCode, setCourseCode] = useState(selectedCourse?.courseCode ?? "");
  const [title, setTitle] = useState(selectedCourse?.title ?? "");
  const [termLabel, setTermLabel] = useState(selectedCourse?.termLabel ?? "");
  const [credits, setCredits] = useState(selectedCourse?.credits == null ? "" : String(selectedCourse.credits));
  const [grade, setGrade] = useState(formatGrade(selectedCourse?.grade) ?? "");

  const hasSelectedCourse = Boolean(selectedCourse);
  const courseFormId = isAddMode ? `create-course-${transcriptId}` : `edit-course-${selectedCourse?.id ?? transcriptId}`;

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {isAddMode ? "Add Extracted Course" : "Selected External Course"}
        </p>
        {isAddMode ? (
          <Link
            href={cancelAddHref}
            scroll={false}
            className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        ) : null}
      </div>

      {!hasSelectedCourse && !isAddMode ? (
        <p className="mt-2 text-sm text-slate-500">No extracted course selected.</p>
      ) : (
        <form
          id={courseFormId}
          action={isAddMode ? createExternalCourseAction : updateExternalCourseAction}
          className="mt-2 grid gap-2"
        >
          <input type="hidden" name="transcriptId" value={transcriptId} />
          {!isAddMode && selectedCourse ? <input type="hidden" name="externalCourseId" value={selectedCourse.id} /> : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              name="courseCode"
              value={courseCode}
              onChange={(event) => setCourseCode(event.target.value)}
              aria-label="External course code"
              placeholder="Course code"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            />
            <input
              name="termLabel"
              value={termLabel}
              onChange={(event) => setTermLabel(event.target.value)}
              aria-label="External course term"
              placeholder="Term"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            />
          </div>

          <input
            required
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="External course title"
            placeholder="Course title"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              name="credits"
              value={credits}
              onChange={(event) => setCredits(event.target.value)}
              inputMode="decimal"
              aria-label="External course credits"
              placeholder="Credits"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            />
            <input
              name="grade"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              aria-label="External course grade"
              placeholder="Grade"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            />
          </div>

        </form>
      )}

      {hasSelectedCourse || isAddMode ? (
        <div className={`mt-2 grid gap-2 ${isAddMode ? "grid-cols-1" : "grid-cols-2"}`}>
          <SubmitButton
            form={courseFormId}
            className="inline-flex h-9 w-full items-center justify-center rounded bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {isAddMode ? "Create Course" : "Save"}
          </SubmitButton>

          {!isAddMode && selectedCourse ? (
            <form
              action={deleteExternalCourseAction}
              onSubmit={(event) => {
                if (!window.confirm("Delete this extracted course? This cannot be undone.")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="transcriptId" value={transcriptId} />
              <input type="hidden" name="externalCourseId" value={selectedCourse.id} />
              <button
                type="submit"
                className="inline-flex h-9 w-full items-center justify-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Remove
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
