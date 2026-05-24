import { CourseDecisionStatus } from "@prisma/client";

export type CompletionStats = {
  total: number;
  mapped: number;
  noCredit: number;
  creditOnly: number;
  unreviewed: number;
  decided: number;
};

export function computeCompletionStats(statuses: CourseDecisionStatus[]): CompletionStats {
  const total = statuses.length;
  const mapped = statuses.filter((status) => status === CourseDecisionStatus.MAPPED).length;
  const noCredit = statuses.filter((status) => status === CourseDecisionStatus.NO_CREDIT).length;
  const creditOnly = statuses.filter((status) => status === CourseDecisionStatus.CREDIT_ONLY).length;
  const unreviewed = statuses.filter((status) => status === CourseDecisionStatus.UNREVIEWED).length;
  const decided = mapped + noCredit + creditOnly;

  return {
    total,
    mapped,
    noCredit,
    creditOnly,
    unreviewed,
    decided,
  };
}

export function ensureAllocationsForSelections(
  selectedProgramCourseIds: string[],
  creditAllocations: Record<string, number | null>,
) {
  for (const programCourseId of selectedProgramCourseIds) {
    const allocated = creditAllocations[programCourseId];
    if (allocated == null || !Number.isFinite(allocated) || allocated < 0) {
      return false;
    }
  }

  return true;
}

type DecisionLockInput = {
  externalCourseId: string;
  externalCourseLabel: string;
  selectedProgramCourseIds: string[];
};

export function computeLockedCatalogCourseMetadata(
  decisions: DecisionLockInput[],
  selectedExternalCourseId: string,
) {
  const lockedCatalogCourseIds = new Set<string>();
  const lockedReasonByCourseId: Record<string, string> = {};

  for (const decision of decisions) {
    if (decision.externalCourseId === selectedExternalCourseId) {
      continue;
    }

    for (const programCourseId of decision.selectedProgramCourseIds) {
      lockedCatalogCourseIds.add(programCourseId);
      if (!lockedReasonByCourseId[programCourseId]) {
        lockedReasonByCourseId[programCourseId] = `Already mapped to ${decision.externalCourseLabel}`;
      }
    }
  }

  return {
    lockedCatalogCourseIds: [...lockedCatalogCourseIds],
    lockedReasonByCourseId,
  };
}
