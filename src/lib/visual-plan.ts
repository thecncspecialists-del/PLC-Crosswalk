import { creditsToMiHours, hoursToMiCredits } from "@/lib/mi-hours";

export type VisualPlanDecisionStatus = "UNREVIEWED" | "MAPPED" | "NO_CREDIT" | "CREDIT_ONLY";

export type VisualPlanInput = {
  planStatus: "DRAFT" | "APPROVED";
  programName: string | null;
  externalCourses: Array<{
    id: string;
    courseCode: string | null;
    title: string;
    description?: string | null;
    credits: number | null;
    status: VisualPlanDecisionStatus;
    selections: Array<{
      programCourseId: string;
      awardedCredits?: number | null;
    }>;
  }>;
  catalogCourses: Array<{
    id: string;
    code: string;
    title: string;
    description?: string | null;
    creditHours: number | null;
  }>;
  journeyGroups?: Array<{
    id: string;
    label: string;
    sortOrder: number;
  }>;
  journeyAssignments?: Array<{
    programCourseId: string;
    groupId: string | null;
    sortOrder: number | null;
  }>;
  awardedMappedCourseIds?: string[];
};

export type VisualPlanData = {
  planStatus: "DRAFT" | "APPROVED";
  programName: string | null;
  externalNodes: Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    credits: number | null;
    status: VisualPlanDecisionStatus;
  }>;
  catalogNodes: Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    creditHours: number | null;
    isMapped: boolean;
    isJourneySelected: boolean;
    isAwardedMapped: boolean;
    journeyGroupId: string | null;
    journeyGroupLabel: string | null;
    journeySortOrder: number | null;
  }>;
  journeyGroups: Array<{
    id: string;
    label: string;
    sortOrder: number;
  }>;
  awardedMappedCourseIds: string[];
  edges: Array<{
    id: string;
    externalCourseId: string;
    programCourseId: string;
    awardedHours: number | null;
  }>;
  summary: {
    transcriptCreditsTotal: number;
    transcriptHoursTotal: number;
    mappedTranscriptCredits: number;
    creditOnlyTranscriptCredits: number;
    noCreditTranscriptCredits: number;
    unreviewedTranscriptCredits: number;
    transcriptCreditsNotAwarded: number;
    transcriptHoursNotAwarded: number;
    programHoursTotal: number;
    programCreditsTotal: number;
    awardedProgramHours: number;
    awardedProgramCredits: number;
    journeyProgramHours: number;
    journeyProgramCredits: number;
    totalEarnedProgramHours: number;
    totalEarnedProgramCredits: number;
    completedProgramHours: number;
    completedProgramCredits: number;
    remainingProgramHours: number;
    remainingProgramCredits: number;
  };
};

function externalCode(courseCode: string | null, title: string) {
  const trimmedCode = courseCode?.trim();
  if (trimmedCode) {
    return trimmedCode;
  }

  return title.trim().split(/\s+/).slice(0, 2).join(" ") || "N/A";
}

function sumNumbers(values: Array<number | null | undefined>) {
  return values.reduce<number>(
    (sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0),
    0,
  );
}

export function buildVisualPlanData(input: VisualPlanInput): VisualPlanData {
  const journeyGroupsInput = input.journeyGroups ?? [];
  const journeyAssignmentsInput = input.journeyAssignments ?? [];
  const awardedMappedCourseIdsInput = input.awardedMappedCourseIds ?? [];
  const catalogCourseById = new Map(input.catalogCourses.map((course) => [course.id, course]));
  const catalogCourseIds = new Set(catalogCourseById.keys());
  const journeyGroupById = new Map(
    journeyGroupsInput.map((group) => [
      group.id,
      { id: group.id, label: group.label.trim(), sortOrder: group.sortOrder },
    ]),
  );
  const journeyCourseGroupById = new Map<string, string | null>();
  const journeyCourseGroupLabelById = new Map<string, string | null>();
  const journeyCourseSortOrderById = new Map<string, number | null>();
  for (const assignment of journeyAssignmentsInput) {
    if (!catalogCourseIds.has(assignment.programCourseId)) {
      continue;
    }
    const group =
      assignment.groupId != null ? journeyGroupById.get(assignment.groupId) ?? null : null;
    journeyCourseGroupById.set(assignment.programCourseId, group?.id ?? null);
    journeyCourseGroupLabelById.set(assignment.programCourseId, group?.label ?? null);
    journeyCourseSortOrderById.set(
      assignment.programCourseId,
      typeof assignment.sortOrder === "number" && Number.isFinite(assignment.sortOrder)
        ? assignment.sortOrder
        : null,
    );
  }
  const awardedMappedCourseIdSet = new Set(
    awardedMappedCourseIdsInput.filter((courseId) => catalogCourseIds.has(courseId)),
  );
  const journeyCourseIdSet = new Set(journeyCourseGroupById.keys());
  const edges = input.externalCourses.flatMap((course) => {
    if (course.status !== "MAPPED") {
      return [];
    }

    return course.selections
      .filter((selection) => catalogCourseIds.has(selection.programCourseId))
      .map((selection) => ({
        id: `${course.id}:${selection.programCourseId}`,
        externalCourseId: course.id,
        programCourseId: selection.programCourseId,
        awardedHours: selection.awardedCredits ?? catalogCourseById.get(selection.programCourseId)?.creditHours ?? null,
      }));
  });
  const mappedCatalogCourseIds = new Set(edges.map((edge) => edge.programCourseId));
  const transcriptCreditsTotal = sumNumbers(input.externalCourses.map((course) => course.credits));
  const mappedTranscriptCredits = sumNumbers(
    input.externalCourses.filter((course) => course.status === "MAPPED").map((course) => course.credits),
  );
  const noCreditTranscriptCredits = sumNumbers(
    input.externalCourses.filter((course) => course.status === "NO_CREDIT").map((course) => course.credits),
  );
  const creditOnlyTranscriptCredits = sumNumbers(
    input.externalCourses.filter((course) => course.status === "CREDIT_ONLY").map((course) => course.credits),
  );
  const unreviewedTranscriptCredits = sumNumbers(
    input.externalCourses.filter((course) => course.status === "UNREVIEWED").map((course) => course.credits),
  );
  const transcriptCreditsAwarded = mappedTranscriptCredits + creditOnlyTranscriptCredits;
  const programHoursTotal = sumNumbers(input.catalogCourses.map((course) => course.creditHours));
  const awardedProgramHours =
    creditsToMiHours(transcriptCreditsAwarded) ?? sumNumbers(edges.map((edge) => edge.awardedHours));
  const journeyProgramHours = sumNumbers(
    [...journeyCourseIdSet].map((courseId) => catalogCourseById.get(courseId)?.creditHours ?? null),
  );
  const completedCatalogCourseIds = new Set([...mappedCatalogCourseIds, ...journeyCourseIdSet]);
  const completedProgramHours = sumNumbers(
    [...completedCatalogCourseIds].map((courseId) => catalogCourseById.get(courseId)?.creditHours ?? null),
  );
  const programCreditsTotal = hoursToMiCredits(programHoursTotal) ?? 0;
  const awardedProgramCredits = transcriptCreditsAwarded;
  const journeyProgramCredits = hoursToMiCredits(journeyProgramHours) ?? 0;
  const totalEarnedProgramHours = awardedProgramHours + journeyProgramHours;
  const totalEarnedProgramCredits = awardedProgramCredits + journeyProgramCredits;
  const completedProgramCredits = hoursToMiCredits(completedProgramHours) ?? 0;
  const remainingProgramHours = Math.max(programHoursTotal - completedProgramHours, 0);
  const remainingProgramCredits = hoursToMiCredits(remainingProgramHours) ?? 0;
  const transcriptHoursTotal = creditsToMiHours(transcriptCreditsTotal) ?? 0;
  const transcriptCreditsNotAwarded = Math.max(transcriptCreditsTotal - transcriptCreditsAwarded, 0);
  const transcriptHoursNotAwarded = creditsToMiHours(transcriptCreditsNotAwarded) ?? 0;

  return {
    planStatus: input.planStatus,
    programName: input.programName,
    externalNodes: input.externalCourses.map((course) => ({
      id: course.id,
      code: externalCode(course.courseCode, course.title),
      title: course.title,
      description: course.description ?? null,
      credits: course.credits,
      status: course.status,
    })),
    catalogNodes: input.catalogCourses.map((course) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      description: course.description ?? null,
      creditHours: course.creditHours,
      isMapped: mappedCatalogCourseIds.has(course.id),
      isJourneySelected: journeyCourseIdSet.has(course.id),
      isAwardedMapped: awardedMappedCourseIdSet.has(course.id),
      journeyGroupId: journeyCourseGroupById.get(course.id) ?? null,
      journeyGroupLabel: journeyCourseGroupLabelById.get(course.id) ?? null,
      journeySortOrder: journeyCourseSortOrderById.get(course.id) ?? null,
    })),
    journeyGroups: journeyGroupsInput
      .map((group) => ({
        id: group.id,
        label: group.label,
        sortOrder: group.sortOrder,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label)),
    awardedMappedCourseIds: [...awardedMappedCourseIdSet],
    edges,
    summary: {
      transcriptCreditsTotal,
      transcriptHoursTotal,
      mappedTranscriptCredits,
      creditOnlyTranscriptCredits,
      noCreditTranscriptCredits,
      unreviewedTranscriptCredits,
      transcriptCreditsNotAwarded,
      transcriptHoursNotAwarded,
      programHoursTotal,
      programCreditsTotal,
      awardedProgramHours,
      awardedProgramCredits,
      journeyProgramHours,
      journeyProgramCredits,
      totalEarnedProgramHours,
      totalEarnedProgramCredits,
      completedProgramHours,
      completedProgramCredits,
      remainingProgramHours,
      remainingProgramCredits,
    },
  };
}
