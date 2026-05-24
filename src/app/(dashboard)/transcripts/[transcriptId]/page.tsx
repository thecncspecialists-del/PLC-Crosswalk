import { CourseDecisionStatus, MappingPlanStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MappingFormSubmitButton } from "@/components/mapping/mapping-form-submit-button";
import { MappingWorkspaceToggle } from "@/components/mapping/mapping-workspace-toggle";
import { PlanApprovalButton } from "@/components/mapping/plan-approval-button";
import { MappingCourseEditor } from "@/components/mapping/mapping-course-editor";
import { ProgramSelectForm } from "@/components/mapping/program-select-form";
import { DeleteReportButton } from "@/components/reports/delete-report-button";
import { DownloadReportButton } from "@/components/reports/download-report-button";
import { ReportGenerateForm } from "@/components/reports/report-generate-form";
import { SelectedExternalCoursePanel } from "@/components/transcripts/selected-external-course-panel";
import { TranscriptSourcePreview } from "@/components/transcripts/transcript-source-preview";
import { TranscriptVisualPlanButton } from "@/components/transcripts/transcript-visual-plan-button";
import { BackButton } from "@/components/ui/back-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/lib/db";
import { formatGradeDisplay } from "@/lib/grade-format";
import { computeCompletionStats, computeLockedCatalogCourseMetadata } from "@/lib/mapping-plan";
import { buildVisualPlanData } from "@/lib/visual-plan";
import {
  createJourneyGroupAction,
  deleteJourneyGroupAction,
  finalizeMappingPlanAction,
  moveJourneyCourseAction,
  moveJourneyGroupAction,
  renameJourneyGroupAction,
  saveCourseMappingDecisionAction,
  saveNoCreditDecisionAction,
  setTranscriptProgramAction,
  toggleJourneyCourseAction,
} from "@/server/actions/mapping-actions";
import { generateReportAction } from "@/server/actions/report-actions";
import {
  createExternalCourseAction,
  deleteExternalCourseAction,
  updateTranscriptInstitutionAction,
  updateExternalCourseAction,
} from "@/server/actions/transcript-actions";

export const dynamic = "force-dynamic";

type TranscriptDetailPageProps = {
  params: Promise<{
    transcriptId: string;
  }>;
  searchParams: Promise<{
    courseId?: string;
    mode?: string;
    workspace?: string;
    notice?: string;
  }>;
};

function statusBadgeClasses(status: CourseDecisionStatus) {
  if (status === "MAPPED") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (status === "CREDIT_ONLY") {
    return "bg-sky-50 text-sky-700 border-sky-200";
  }
  if (status === "NO_CREDIT") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusLabel(status: CourseDecisionStatus) {
  if (status === "MAPPED") {
    return "Mapped";
  }
  if (status === "CREDIT_ONLY") {
    return "Credit";
  }
  if (status === "NO_CREDIT") {
    return "No Credit";
  }
  return "Unreviewed";
}

function noticeMessage(notice: string | undefined) {
  if (!notice) {
    return null;
  }

  if (notice === "mapping_save_blocked") {
    return "Mapping update was blocked. One or more selected catalog courses are already mapped elsewhere.";
  }
  if (notice === "mapping_save_conflict") {
    return "Mapping update conflicted with an existing selection. Refresh and try again.";
  }
  if (notice === "decision_save_blocked") {
    return "Decision update was blocked because the mapping context is incomplete.";
  }
  if (notice === "decision_unchanged") {
    return "Decision is already set to that value. No changes were applied.";
  }
  if (notice === "plan_already_approved") {
    return "This mapping plan is already approved.";
  }
  if (notice === "plan_has_pending_decisions") {
    return "Approve Plan is unavailable until all extracted courses are decided.";
  }
  if (notice === "plan_missing_program") {
    return "Select a program before approving the mapping plan.";
  }

  return null;
}

export default async function TranscriptDetailPage({ params, searchParams }: TranscriptDetailPageProps) {
  const { transcriptId } = await params;
  const query = await searchParams;
  const activeNotice = noticeMessage(query.notice);

  const [transcript, programs] = await Promise.all([
    db.transcript.findUnique({
      where: { id: transcriptId },
      include: {
        student: true,
        institution: true,
        externalCourses: {
          orderBy: [{ termLabel: "asc" }, { title: "asc" }],
        },
        files: {
          orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            fileName: true,
            uploadedAt: true,
          },
        },
        mappingPlan: {
          include: {
            selectedProgram: true,
            journeyCourses: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                programCourseId: true,
                journeyGroupId: true,
                sortOrder: true,
                termCode: true,
                createdAt: true,
              },
            },
            journeyGroups: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                label: true,
                sortOrder: true,
              },
            },
            decisions: {
              include: {
                externalCourse: true,
                selections: {
                  include: {
                    programCourse: true,
                  },
                },
                evidence: true,
              },
            },
          },
        },
        reports: {
          orderBy: { generatedAt: "desc" },
          take: 8,
        },
      },
    }),
    db.program.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  if (!transcript) {
    notFound();
  }

  let nextQueueTranscript = await db.transcript.findFirst({
    where: {
      OR: [
        {
          uploadedAt: {
            lt: transcript.uploadedAt,
          },
        },
        {
          uploadedAt: transcript.uploadedAt,
          id: {
            lt: transcript.id,
          },
        },
      ],
    },
    orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!nextQueueTranscript) {
    nextQueueTranscript = await db.transcript.findFirst({
      where: {
        id: {
          not: transcript.id,
        },
      },
      orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  const selectedProgramId = transcript.mappingPlan?.selectedProgramId ?? null;
  const catalogForProgram = selectedProgramId
    ? await db.programCourse.findMany({
        where: {
          programId: selectedProgramId,
        },
        include: {
          outcomes: {
            orderBy: [{ outcomeCode: "asc" }, { description: "asc" }],
          },
        },
        orderBy: [{ code: "asc" }, { title: "asc" }],
      })
    : [];

  const decisionsByExternalCourseId = new Map(
    (transcript.mappingPlan?.decisions ?? []).map((decision) => [decision.externalCourseId, decision]),
  );
  const externalCoursesWithDecisionState = transcript.externalCourses.map((course) => {
    const decision = decisionsByExternalCourseId.get(course.id);
    return {
      externalCourse: course,
      decision:
        decision ??
        ({
          status: CourseDecisionStatus.UNREVIEWED,
          rationale: null,
          selections: [],
          evidence: [],
        } as const),
    };
  });

  const completionStats = computeCompletionStats(
    externalCoursesWithDecisionState.map((row) => row.decision.status as CourseDecisionStatus),
  );
  const hasMappedDecisions = (transcript.mappingPlan?.decisions ?? []).some(
    (decision) => decision.status === CourseDecisionStatus.MAPPED,
  );
  const hasJourneySelections = (transcript.mappingPlan?.journeyCourses.length ?? 0) > 0;
  const programSwitchWarning =
    selectedProgramId && (hasMappedDecisions || hasJourneySelections)
      ? "Switching programs will clear mapped course selections and student journey items, and set mapped courses back to Unreviewed. Continue?"
      : null;

  const selectedCourseId =
    query.courseId && transcript.externalCourses.some((course) => course.id === query.courseId)
      ? query.courseId
      : transcript.externalCourses[0]?.id ?? null;
  const selectedRow = externalCoursesWithDecisionState.find((row) => row.externalCourse.id === selectedCourseId) ?? null;
  const isAddMode = query.mode === "add";
  const workspaceView = query.workspace === "preview" ? "preview" : "mapping";
  const selectedDecisionKey = selectedRow
    ? `${selectedRow.decision.status}:${selectedRow.decision.selections
        .map((selection) => `${selection.programCourseId}:${selection.awardedCredits ?? ""}`)
        .sort()
        .join("|")}`
    : "none";
  const mappingFormId = selectedRow ? `mapping-form-${selectedRow.externalCourse.id}` : null;
  const lockedCourseMetadata = selectedRow
    ? computeLockedCatalogCourseMetadata(
        (transcript.mappingPlan?.decisions ?? []).map((decision) => ({
          externalCourseId: decision.externalCourseId,
          externalCourseLabel: `${decision.externalCourse.courseCode ?? "N/A"} ${decision.externalCourse.title}`.trim(),
          selectedProgramCourseIds: decision.selections.map((selection) => selection.programCourseId),
        })),
        selectedRow.externalCourse.id,
      )
    : {
        lockedCatalogCourseIds: [],
        lockedReasonByCourseId: {},
      };

  const selectedCourseParams = new URLSearchParams();
  if (selectedCourseId) {
    selectedCourseParams.set("courseId", selectedCourseId);
  }
  if (workspaceView === "preview") {
    selectedCourseParams.set("workspace", "preview");
  }
  const selectedCourseQuery = selectedCourseParams.toString();
  const selectedCourseHref = selectedCourseQuery
    ? `/transcripts/${transcript.id}?${selectedCourseQuery}`
    : `/transcripts/${transcript.id}`;
  const addCourseParams = new URLSearchParams(selectedCourseParams.toString());
  addCourseParams.set("mode", "add");
  const addCourseHref = `/transcripts/${transcript.id}?${addCourseParams.toString()}`;
  const mappingPlanStatus = transcript.mappingPlan?.status ?? MappingPlanStatus.DRAFT;
  const isPlanApproved = mappingPlanStatus === MappingPlanStatus.APPROVED;
  const selectedDecisionToggleState = selectedRow
    ? selectedRow.decision.status === CourseDecisionStatus.NO_CREDIT
      ? "no_credit"
      : selectedRow.decision.status === CourseDecisionStatus.UNREVIEWED
        ? "unreviewed"
        : "credit_only"
    : null;
  const canFinalize =
    completionStats.total > 0 &&
    completionStats.unreviewed === 0 &&
    Boolean(selectedProgramId) &&
    Boolean(transcript.mappingPlan);
  const canSubmitApproval = canFinalize && mappingPlanStatus === MappingPlanStatus.DRAFT;
  const mappingStackHeightClass = "lg:h-[56rem]";
  const transcriptLabel = `${transcript.student.firstName} ${transcript.student.lastName}`;
  const transcriptFiles =
    transcript.files.length > 0
      ? transcript.files.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          uploadedAt: file.uploadedAt.toISOString(),
        }))
      : [
          {
            id: null,
            fileName: transcript.fileName,
            uploadedAt: transcript.uploadedAt.toISOString(),
          },
        ];
  const selectedSourceFileId = selectedRow?.externalCourse.transcriptFileId ?? transcriptFiles[0]?.id ?? null;
  const visualPlan = buildVisualPlanData({
    planStatus: mappingPlanStatus,
    programName: transcript.mappingPlan?.selectedProgram?.name ?? null,
    externalCourses: externalCoursesWithDecisionState.map((row) => ({
      id: row.externalCourse.id,
      courseCode: row.externalCourse.courseCode,
      title: row.externalCourse.title,
      description: row.externalCourse.sourceSnippet,
      credits: row.externalCourse.credits ? Number(row.externalCourse.credits) : null,
      status: row.decision.status as CourseDecisionStatus,
      selections: row.decision.selections.map((selection) => ({
        programCourseId: selection.programCourseId,
        awardedCredits: selection.awardedCredits ? Number(selection.awardedCredits) : null,
      })),
    })),
    catalogCourses: catalogForProgram.map((course) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      description: course.outcomes.map((outcome) => outcome.description).join(" "),
      creditHours: course.creditHours ? Number(course.creditHours) : null,
    })),
    journeyAssignments:
      transcript.mappingPlan?.journeyCourses.map((course) => ({
        programCourseId: course.programCourseId,
        groupId: course.journeyGroupId,
        sortOrder: course.sortOrder,
      })) ?? [],
    journeyGroups:
      transcript.mappingPlan?.journeyGroups.map((group) => ({
        id: group.id,
        label: group.label,
        sortOrder: group.sortOrder,
      })) ?? [],
    awardedMappedCourseIds:
      transcript.mappingPlan?.decisions
        .filter((decision) => decision.status === CourseDecisionStatus.MAPPED)
        .flatMap((decision) => decision.selections.map((selection) => selection.programCourseId)) ?? [],
  });

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallbackHref="/transcripts" label="Back to Transcript Queue" />
        {nextQueueTranscript ? (
          <Link
            href={`/transcripts/${nextQueueTranscript.id}`}
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded border border-slate-400 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 hover:shadow"
            title={`Proceed to ${nextQueueTranscript.student.firstName} ${nextQueueTranscript.student.lastName}`}
          >
            <span>Next Transcript</span>
            <span aria-hidden="true" className="text-base leading-none">
              &rarr;
            </span>
          </Link>
        ) : null}
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Transcript</p>
            <h1 className="text-lg font-semibold text-slate-900">
              {transcript.student.lastName}, {transcript.student.firstName}
            </h1>
            <p className="text-sm text-slate-600">
              {transcript.institution.name}
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-500 underline">Edit institution</summary>
              <form action={updateTranscriptInstitutionAction} className="mt-2 flex items-center gap-2">
                <input type="hidden" name="transcriptId" value={transcript.id} />
                <input type="hidden" name="returnCourseId" value={selectedCourseId ?? ""} />
                <input
                  type="text"
                  name="institutionName"
                  defaultValue={transcript.institution.name}
                  className="h-8 w-72 max-w-full rounded border border-slate-300 px-2 text-xs text-slate-800"
                />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Save
                </button>
              </form>
            </details>
            <p className="mt-1 text-xs text-slate-500">
              Mapping plan: {transcript.mappingPlan?.status ?? "DRAFT"} | decided {completionStats.decided}/
              {completionStats.total}
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <TranscriptVisualPlanButton
              disabled={!selectedProgramId}
              transcriptLabel={transcriptLabel}
              visualPlan={visualPlan}
              transcriptId={transcript.id}
              toggleJourneyCourseAction={toggleJourneyCourseAction}
              moveJourneyCourseAction={moveJourneyCourseAction}
              createJourneyGroupAction={createJourneyGroupAction}
              renameJourneyGroupAction={renameJourneyGroupAction}
              deleteJourneyGroupAction={deleteJourneyGroupAction}
              moveJourneyGroupAction={moveJourneyGroupAction}
            />
            <ReportGenerateForm transcriptId={transcript.id} format="ADMIN" action={generateReportAction} />
            <div className="flex min-w-[12.5rem] flex-col gap-2">
              <ReportGenerateForm transcriptId={transcript.id} format="STUDENT" action={generateReportAction} />
              <form action={finalizeMappingPlanAction}>
                <input type="hidden" name="transcriptId" value={transcript.id} />
                <PlanApprovalButton
                  formId={mappingFormId ?? undefined}
                  isPlanApproved={isPlanApproved}
                  canFinalize={canSubmitApproval}
                />
              </form>
            </div>
          </div>
        </div>
      </div>

      {activeNotice ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{activeNotice}</p>
      ) : null}

      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-4 lg:items-start">
          <SelectedExternalCoursePanel
            key={
              selectedRow
                ? `${isAddMode ? "add" : "edit"}:${selectedRow.externalCourse.id}:${selectedRow.externalCourse.courseCode ?? ""}:${selectedRow.externalCourse.title}:${selectedRow.externalCourse.termLabel ?? ""}:${selectedRow.externalCourse.grade ?? ""}:${selectedRow.externalCourse.credits ?? ""}`
                : isAddMode
                  ? "add-empty"
                  : "empty"
            }
            transcriptId={transcript.id}
            selectedCourse={
              selectedRow
                ? {
                    id: selectedRow.externalCourse.id,
                    courseCode: selectedRow.externalCourse.courseCode,
                    title: selectedRow.externalCourse.title,
                    credits: selectedRow.externalCourse.credits ? Number(selectedRow.externalCourse.credits) : null,
                    grade: selectedRow.externalCourse.grade,
                    termLabel: selectedRow.externalCourse.termLabel,
                  }
                : null
            }
            isAddMode={isAddMode}
            cancelAddHref={selectedCourseHref}
            updateExternalCourseAction={updateExternalCourseAction}
            createExternalCourseAction={createExternalCourseAction}
            deleteExternalCourseAction={deleteExternalCourseAction}
          />

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-2">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-slate-500">Selected Program</p>
                <ProgramSelectForm
                  transcriptId={transcript.id}
                  selectedProgramId={selectedProgramId}
                  programs={programs.map((program) => ({ id: program.id, name: program.name }))}
                  changeWarningMessage={programSwitchWarning}
                  action={setTranscriptProgramAction}
                />
              </div>

              {!isAddMode && selectedRow && selectedProgramId && mappingFormId ? (
                <MappingFormSubmitButton formId={mappingFormId}>Accept Mapping</MappingFormSubmitButton>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="text-right text-xs text-slate-600">
                  {isPlanApproved
                    ? "Plan approved. Any mapping change will return this plan to draft."
                    : canFinalize
                      ? "All courses decided. Ready for final approval."
                      : `${completionStats.unreviewed} course${completionStats.unreviewed === 1 ? "" : "s"} still need a decision before final approval.`}
                </p>
                {!isAddMode && selectedRow ? (
                  <div className="inline-grid h-9 w-[18rem] grid-cols-3 items-center rounded border border-slate-300 bg-white p-0.5">
                    <form action={saveNoCreditDecisionAction} className="h-full">
                      <input type="hidden" name="transcriptId" value={transcript.id} />
                      <input type="hidden" name="externalCourseId" value={selectedRow.externalCourse.id} />
                      <input type="hidden" name="decisionType" value="no_credit" />
                      <input type="hidden" name="rationale" value={selectedRow.decision.rationale ?? ""} />
                      <input
                        type="hidden"
                        name="evidenceNote"
                        value={
                          selectedRow.decision.evidence.find(
                            (evidence) => evidence.sourceRef === "reviewer-evidence-note",
                          )?.snippet ?? ""
                        }
                      />
                      <SubmitButton
                        pendingLabel="Saving..."
                        className={`inline-flex h-full w-full items-center justify-center rounded text-xs font-semibold ${
                          selectedDecisionToggleState === "no_credit"
                            ? "bg-amber-100 text-amber-800"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        No Credit
                      </SubmitButton>
                    </form>
                    <form action={saveNoCreditDecisionAction} className="h-full">
                      <input type="hidden" name="transcriptId" value={transcript.id} />
                      <input type="hidden" name="externalCourseId" value={selectedRow.externalCourse.id} />
                      <input type="hidden" name="decisionType" value="unreviewed" />
                      <input type="hidden" name="rationale" value={selectedRow.decision.rationale ?? ""} />
                      <input
                        type="hidden"
                        name="evidenceNote"
                        value={
                          selectedRow.decision.evidence.find(
                            (evidence) => evidence.sourceRef === "reviewer-evidence-note",
                          )?.snippet ?? ""
                        }
                      />
                      <SubmitButton
                        pendingLabel="Saving..."
                        className={`inline-flex h-full w-full items-center justify-center rounded text-xs font-semibold ${
                          selectedDecisionToggleState === "unreviewed"
                            ? "bg-slate-200 text-slate-800"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Unreviewed
                      </SubmitButton>
                    </form>
                    <form action={saveNoCreditDecisionAction} className="h-full">
                      <input type="hidden" name="transcriptId" value={transcript.id} />
                      <input type="hidden" name="externalCourseId" value={selectedRow.externalCourse.id} />
                      <input type="hidden" name="decisionType" value="credit_only" />
                      <input type="hidden" name="rationale" value={selectedRow.decision.rationale ?? ""} />
                      <input
                        type="hidden"
                        name="evidenceNote"
                        value={
                          selectedRow.decision.evidence.find(
                            (evidence) => evidence.sourceRef === "reviewer-evidence-note",
                          )?.snippet ?? ""
                        }
                      />
                      <SubmitButton
                        pendingLabel="Saving..."
                        className={`inline-flex h-full w-full items-center justify-center rounded text-xs font-semibold ${
                          selectedDecisionToggleState === "credit_only"
                            ? "bg-sky-100 text-sky-800"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Credit
                      </SubmitButton>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <aside
          className={`flex min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-white p-3 lg:mt-12 lg:w-[360px] lg:shrink-0 ${mappingStackHeightClass}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Extracted Courses</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                {completionStats.decided}/{completionStats.total}
              </span>
              <Link
                href={addCourseHref}
                scroll={false}
                className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Add Course
              </Link>
            </div>
          </div>
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
            {externalCoursesWithDecisionState.map(({ externalCourse, decision }) => {
              const isSelected = externalCourse.id === selectedCourseId;
              return (
                <li key={externalCourse.id}>
                  <Link
                    href={`/transcripts/${transcript.id}?${new URLSearchParams(
                      workspaceView === "preview"
                        ? { courseId: externalCourse.id, workspace: "preview" }
                        : { courseId: externalCourse.id },
                    ).toString()}`}
                    scroll={false}
                    className={`grid h-20 grid-rows-[1fr_auto] gap-1 rounded border p-2 text-sm ${isSelected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="min-w-0 grid grid-cols-[1fr_auto] items-start gap-2">
                      <p className="truncate font-medium text-slate-900">
                        {externalCourse.courseCode ?? "N/A"} {externalCourse.title}
                      </p>
                      <span
                        className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusBadgeClasses(decision.status as CourseDecisionStatus)}`}
                      >
                        {statusLabel(decision.status as CourseDecisionStatus)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-600">
                      credits: {externalCourse.credits ? Number(externalCourse.credits) : "N/A"} | grade:{" "}
                      {formatGradeDisplay(externalCourse.grade)}
                    </p>
                  </Link>
                </li>
              );
            })}
            {externalCoursesWithDecisionState.length === 0 ? (
              <li className="text-sm text-slate-500">No extracted courses found for this transcript.</li>
            ) : null}
          </ul>
        </aside>

        <div className="min-w-0 flex-1 grid gap-4">
          {!selectedRow ? (
            <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No extracted courses available.
            </div>
          ) : isAddMode ? (
            <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Save the new extracted course above to begin mapping it.
            </div>
          ) : !selectedProgramId ? (
            <TranscriptSourcePreview
              key={selectedSourceFileId ?? "default-source-preview"}
              transcriptId={transcript.id}
              transcriptLabel={transcriptLabel}
              files={transcriptFiles}
              defaultFileId={selectedSourceFileId}
              helperText="Select a program above when you are ready to assign mapping decisions."
              stackHeightClass={mappingStackHeightClass}
            />
          ) : (
            <MappingWorkspaceToggle
              key={`${selectedRow.externalCourse.id}:${selectedDecisionKey}:${selectedSourceFileId ?? "default"}`}
              initialView={workspaceView}
              mappingPane={
                <MappingCourseEditor
                  key={`${selectedRow.externalCourse.id}:${selectedDecisionKey}`}
                  formId={mappingFormId ?? undefined}
                  hideInlineSubmit
                  transcriptId={transcript.id}
                  externalCourse={{
                    id: selectedRow.externalCourse.id,
                    courseCode: selectedRow.externalCourse.courseCode,
                    title: selectedRow.externalCourse.title,
                    credits: selectedRow.externalCourse.credits ? Number(selectedRow.externalCourse.credits) : null,
                    grade: selectedRow.externalCourse.grade,
                    termLabel: selectedRow.externalCourse.termLabel,
                  }}
                  decision={{
                    status: selectedRow.decision.status as "UNREVIEWED" | "MAPPED" | "NO_CREDIT" | "CREDIT_ONLY",
                    rationale: selectedRow.decision.rationale,
                    selections: selectedRow.decision.selections.map((selection) => ({
                      programCourseId: selection.programCourseId,
                      awardedCredits: selection.awardedCredits ? Number(selection.awardedCredits) : null,
                    })),
                    evidence: selectedRow.decision.evidence.map((evidence) => ({
                      id: evidence.id,
                      kind: evidence.kind,
                      snippet: evidence.snippet,
                      sourceRef: evidence.sourceRef,
                    })),
                  }}
                  catalogCourses={catalogForProgram.map((course) => ({
                    id: course.id,
                    code: course.code,
                    title: course.title,
                    creditHours: course.creditHours ? Number(course.creditHours) : null,
                  }))}
                  lockedCatalogCourseIds={lockedCourseMetadata.lockedCatalogCourseIds}
                  lockedReasonByCourseId={lockedCourseMetadata.lockedReasonByCourseId}
                  stackHeightClass={mappingStackHeightClass}
                  saveMappingAction={saveCourseMappingDecisionAction}
                />
              }
              previewPane={
                <TranscriptSourcePreview
                  key={selectedSourceFileId ?? "default-source-preview"}
                  transcriptId={transcript.id}
                  transcriptLabel={transcriptLabel}
                  files={transcriptFiles}
                  defaultFileId={selectedSourceFileId}
                  helperText="Preview the source PDF while verifying extracted courses."
                  stackHeightClass={mappingStackHeightClass}
                />
              }
            />
          )}
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Recent Reports</h2>
          <Link href="/reports" className="text-xs text-slate-700 underline">
            Open all reports
          </Link>
        </div>
        <ul className="mt-3 grid gap-1 text-sm text-slate-700">
          {transcript.reports.map((report) => (
            <li key={report.id} className="flex items-center justify-between gap-2">
              <span>
                {report.format} report generated {report.generatedAt.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <DownloadReportButton
                  reportId={report.id}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                />
                <DeleteReportButton reportId={report.id} />
              </div>
            </li>
          ))}
          {transcript.reports.length === 0 ? <li className="text-slate-500">No reports generated yet.</li> : null}
        </ul>
      </div>
    </section>
  );
}
