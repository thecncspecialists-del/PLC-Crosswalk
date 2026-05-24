import { CourseDecisionStatus, MappingPlanStatus, ReportFormat } from "@prisma/client";

import { formatMiCredits, formatMiHours, hoursToMiCredits } from "@/lib/mi-hours";

type CourseDecisionForReport = {
  status: CourseDecisionStatus;
  awardedCredits: number | string | { toString: () => string } | null;
  rationale: string | null;
  reviewedAt: Date | null;
  externalCourse: {
    courseCode: string | null;
    title: string;
    credits: number | string | { toString: () => string } | null;
    grade: string | null;
  };
  selections: Array<{
    awardedCredits: number | string | { toString: () => string } | null;
    programCourse: {
      code: string;
      title: string;
    };
  }>;
  evidence: Array<{
    kind: string;
    snippet: string;
  }>;
};

type TranscriptForReport = {
  id: string;
  uploadedAt: Date;
  student: {
    firstName: string;
    lastName: string;
    studentRef: string | null;
  };
  institution: {
    name: string;
  };
  mappingPlan: {
    status: MappingPlanStatus;
    approvedAt: Date | null;
    selectedProgram: {
      name: string;
    } | null;
    decisions: CourseDecisionForReport[];
  } | null;
};

function toNumber(value: number | string | { toString: () => string } | null) {
  if (value == null) {
    return null;
  }
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAwardedHoursText(value: number | string | { toString: () => string } | null) {
  const hours = toNumber(value);
  return `${formatMiHours(hours)} (${formatMiCredits(hoursToMiCredits(hours))})`;
}

function externalCourseLabel(decision: CourseDecisionForReport) {
  return `${decision.externalCourse.courseCode ?? "N/A"} ${decision.externalCourse.title}`.trim();
}

function formatDecisionSelectionLine(decision: CourseDecisionForReport) {
  if (decision.status === CourseDecisionStatus.CREDIT_ONLY) {
    return `Unmapped PLC award (${formatAwardedHoursText(decision.awardedCredits)})`;
  }

  if (decision.selections.length === 0) {
    return "No mapped catalog courses.";
  }

  return decision.selections
    .map((selection) => {
      const targetCourse = `${selection.programCourse.code} ${selection.programCourse.title}`;
      return `${targetCourse} (awarded=${formatAwardedHoursText(selection.awardedCredits)})`;
    })
    .join(" | ");
}

function renderAdminReport(transcript: TranscriptForReport) {
  const decisions = transcript.mappingPlan?.decisions ?? [];
  const undecidedCount = decisions.filter((decision) => decision.status === CourseDecisionStatus.UNREVIEWED).length;

  const header = [
    "The Machinists Institute - PLC Admin Report",
    `Transcript ID: ${transcript.id}`,
    `Student: ${transcript.student.firstName} ${transcript.student.lastName}`,
    `Student Ref: ${transcript.student.studentRef ?? "N/A"}`,
    `Institution: ${transcript.institution.name}`,
    `Uploaded At: ${transcript.uploadedAt.toISOString()}`,
    `Program: ${transcript.mappingPlan?.selectedProgram?.name ?? "Not selected"}`,
    `Plan Status: ${transcript.mappingPlan?.status ?? "DRAFT"}`,
    `Plan Approved At: ${transcript.mappingPlan?.approvedAt?.toISOString() ?? "N/A"}`,
    `Undecided Courses: ${undecidedCount}`,
    "",
    "Course Decisions",
    "--------------",
  ];

  const lines = decisions.flatMap((decision) => {
    const evidenceLine = decision.evidence.map((entry) => `${entry.kind}: ${entry.snippet}`).join(" || ");
    return [
      `${externalCourseLabel(decision)} | status=${decision.status}`,
      `Selections: ${formatDecisionSelectionLine(decision)}`,
      `Rationale: ${decision.rationale ?? "N/A"}`,
      `Evidence: ${evidenceLine || "N/A"}`,
      "",
    ];
  });

  return [...header, ...(lines.length > 0 ? lines : ["No mapping decisions recorded yet."])].join("\n");
}

function renderStudentReport(transcript: TranscriptForReport) {
  const mappedDecisions =
    transcript.mappingPlan?.decisions.filter(
      (decision) => decision.status === CourseDecisionStatus.MAPPED || decision.status === CourseDecisionStatus.CREDIT_ONLY,
    ) ?? [];

  const header = [
    "The Machinists Institute - PLC Award Summary",
    `Student: ${transcript.student.firstName} ${transcript.student.lastName}`,
    `Institution: ${transcript.institution.name}`,
    `Program: ${transcript.mappingPlan?.selectedProgram?.name ?? "Not selected"}`,
    "",
    "Awarded MI Hours / Credit Equivalent",
    "------------------------------------",
  ];

  const lines = mappedDecisions.flatMap((decision) => {
    const externalLabel = externalCourseLabel(decision);
    if (decision.status === CourseDecisionStatus.CREDIT_ONLY) {
      return [
        `${externalLabel} -> Unmapped PLC Credit | awarded=${formatAwardedHoursText(decision.awardedCredits)} | rationale=${decision.rationale ?? "N/A"}`,
      ];
    }

    return decision.selections.map((selection) => {
      const targetCourse = `${selection.programCourse.code} ${selection.programCourse.title}`;
      return `${externalLabel} -> ${targetCourse} | awarded=${formatAwardedHoursText(selection.awardedCredits)} | rationale=${decision.rationale ?? "N/A"}`;
    });
  });

  return [...header, ...(lines.length > 0 ? lines : ["No awarded credit decisions yet."])].join("\n");
}

export function buildReportContent(transcript: TranscriptForReport, format: ReportFormat) {
  return format === ReportFormat.ADMIN ? renderAdminReport(transcript) : renderStudentReport(transcript);
}
