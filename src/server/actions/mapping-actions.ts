"use server";

import { ActionHistoryStatus, CourseDecisionStatus, EvidenceKind, MappingPlanStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordActionHistory } from "@/lib/action-history";
import { db } from "@/lib/db";
import { isNoopDecisionUpdate } from "@/lib/mapping-action-guards";
import { ensureAllocationsForSelections } from "@/lib/mapping-plan";
import { requireAdminUser } from "@/lib/permissions";
import {
  createJourneyGroupSchema,
  courseMappingDecisionSchema,
  deleteJourneyGroupSchema,
  finalizePlanSchema,
  moveJourneyCourseSchema,
  moveJourneyGroupSchema,
  noCreditDecisionSchema,
  programSelectionSchema,
  renameJourneyGroupSchema,
  toggleJourneyCourseSchema,
} from "@/lib/validation";

function transcriptNoticeHref(args: {
  transcriptId: string;
  notice?: string | null;
  courseId?: string | null;
}) {
  const params = new URLSearchParams();
  if (args.courseId) {
    params.set("courseId", args.courseId);
  }
  if (args.notice) {
    params.set("notice", args.notice);
  }
  const query = params.toString();
  return query ? `/transcripts/${args.transcriptId}?${query}` : `/transcripts/${args.transcriptId}`;
}

async function ensureMappingPlan(
  tx: Prisma.TransactionClient,
  transcriptId: string,
) {
  const transcript = await tx.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      id: true,
      externalCourses: {
        select: {
          id: true,
        },
      },
      mappingPlan: {
        select: {
          id: true,
          selectedProgramId: true,
          status: true,
        },
      },
    },
  });

  if (!transcript) {
    return null;
  }

  let mappingPlanId = transcript.mappingPlan?.id;
  if (!mappingPlanId) {
    const createdPlan = await tx.mappingPlan.create({
      data: {
        transcriptId: transcript.id,
      },
      select: {
        id: true,
      },
    });
    mappingPlanId = createdPlan.id;
  }

  if (transcript.externalCourses.length > 0) {
    await tx.courseMappingDecision.createMany({
      data: transcript.externalCourses.map((externalCourse) => ({
        mappingPlanId,
        externalCourseId: externalCourse.id,
      })),
      skipDuplicates: true,
    });
  }

  return {
    mappingPlanId,
    selectedProgramId: transcript.mappingPlan?.selectedProgramId ?? null,
    status: transcript.mappingPlan?.status ?? MappingPlanStatus.DRAFT,
  };
}

function normalizeGroupLabel(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return "Unscheduled";
  }
  return normalized;
}

async function ensureDefaultJourneyGroup(args: {
  tx: Prisma.TransactionClient;
  mappingPlanId: string;
  updatedById: string;
  label?: string;
}) {
  const { tx, mappingPlanId, updatedById, label } = args;
  const existing = await tx.mappingPlanJourneyGroup.findFirst({
    where: { mappingPlanId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, label: true, sortOrder: true },
  });
  if (existing) {
    return existing;
  }

  return tx.mappingPlanJourneyGroup.create({
    data: {
      mappingPlanId,
      label: normalizeGroupLabel(label),
      sortOrder: 0,
      updatedById,
    },
    select: { id: true, label: true, sortOrder: true },
  });
}

async function normalizeJourneyPlanState(args: {
  tx: Prisma.TransactionClient;
  mappingPlanId: string;
  updatedById: string;
}) {
  const { tx, mappingPlanId, updatedById } = args;
  const [groups, courses] = await Promise.all([
    tx.mappingPlanJourneyGroup.findMany({
      where: { mappingPlanId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        label: true,
        sortOrder: true,
      },
    }),
    tx.mappingPlanJourneyCourse.findMany({
      where: { mappingPlanId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        journeyGroupId: true,
        termCode: true,
      },
    }),
  ]);

  if (courses.length === 0) {
    if (groups.length === 0) {
      return;
    }
    await Promise.all(
      groups.map((group, index) =>
        group.sortOrder === index
          ? Promise.resolve()
          : tx.mappingPlanJourneyGroup.update({
              where: { id: group.id },
              data: { sortOrder: index, updatedById },
            }),
      ),
    );
    return;
  }

  let normalizedGroups = groups;
  if (normalizedGroups.length === 0) {
    const orderedLabels: string[] = [];
    for (const course of courses) {
      const label = normalizeGroupLabel(course.termCode);
      if (!orderedLabels.includes(label)) {
        orderedLabels.push(label);
      }
    }

    if (orderedLabels.length === 0) {
      orderedLabels.push("Unscheduled");
    }

    for (const [index, label] of orderedLabels.entries()) {
      await tx.mappingPlanJourneyGroup.create({
        data: {
          mappingPlanId,
          label,
          sortOrder: index,
          updatedById,
        },
      });
    }

    normalizedGroups = await tx.mappingPlanJourneyGroup.findMany({
      where: { mappingPlanId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, label: true, sortOrder: true },
    });
  }

  const groupsById = new Map(normalizedGroups.map((group) => [group.id, group]));
  const groupsByLabel = new Map(
    normalizedGroups.map((group) => [group.label.trim().toUpperCase(), group]),
  );
  const defaultGroup = normalizedGroups[0]!;

  const courseIdsByGroupId = new Map<string, string[]>();
  for (const group of normalizedGroups) {
    courseIdsByGroupId.set(group.id, []);
  }

  for (const course of courses) {
    const courseLabelKey = (course.termCode ?? "").trim().toUpperCase();
    const matchingGroup =
      (courseLabelKey ? groupsByLabel.get(courseLabelKey) : null) ?? defaultGroup;
    const targetGroup =
      (course.journeyGroupId ? groupsById.get(course.journeyGroupId) : null) ?? matchingGroup;
    const bucket = courseIdsByGroupId.get(targetGroup.id) ?? [];
    bucket.push(course.id);
    courseIdsByGroupId.set(targetGroup.id, bucket);
  }

  let groupSortOrderChanged = false;
  await Promise.all(
    normalizedGroups.map((group, index) => {
      if (group.sortOrder === index) {
        return Promise.resolve();
      }
      groupSortOrderChanged = true;
      return tx.mappingPlanJourneyGroup.update({
        where: { id: group.id },
        data: { sortOrder: index, updatedById },
      });
    }),
  );

  const courseUpdates: Array<Promise<unknown>> = [];
  for (const [groupId, courseIds] of courseIdsByGroupId.entries()) {
    for (const [index, courseId] of courseIds.entries()) {
      courseUpdates.push(
        tx.mappingPlanJourneyCourse.update({
          where: { id: courseId },
          data: {
            journeyGroupId: groupId,
            sortOrder: index,
            updatedById,
          },
        }),
      );
    }
  }

  if (groupSortOrderChanged || courseUpdates.length > 0) {
    await Promise.all(courseUpdates);
  }
}

async function getOrderedJourneyPlan(args: {
  tx: Prisma.TransactionClient;
  mappingPlanId: string;
  updatedById: string;
}) {
  const { tx, mappingPlanId, updatedById } = args;
  await normalizeJourneyPlanState({ tx, mappingPlanId, updatedById });
  const [groups, courses] = await Promise.all([
    tx.mappingPlanJourneyGroup.findMany({
      where: { mappingPlanId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        label: true,
        sortOrder: true,
      },
    }),
    tx.mappingPlanJourneyCourse.findMany({
      where: { mappingPlanId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        programCourseId: true,
        journeyGroupId: true,
        sortOrder: true,
      },
    }),
  ]);

  return { groups, courses };
}

type CourseLockConflict = {
  programCourseId: string;
  externalCourseLabel: string;
};

async function findLockedCourseConflicts(args: {
  tx: Prisma.TransactionClient;
  mappingPlanId: string;
  decisionId: string;
  selectedProgramCourseIds: string[];
}) {
  const { tx, mappingPlanId, decisionId, selectedProgramCourseIds } = args;

  if (selectedProgramCourseIds.length === 0) {
    return [] as CourseLockConflict[];
  }

  const conflicts = await tx.courseMappingSelection.findMany({
    where: {
      mappingPlanId,
      programCourseId: { in: selectedProgramCourseIds },
      decisionId: { not: decisionId },
    },
    include: {
      decision: {
        include: {
          externalCourse: true,
        },
      },
    },
  });

  const byCourseId = new Map<string, CourseLockConflict>();
  for (const conflict of conflicts) {
    if (byCourseId.has(conflict.programCourseId)) {
      continue;
    }

    const sourceCourse = conflict.decision.externalCourse;
    const label = `${sourceCourse.courseCode ?? "N/A"} ${sourceCourse.title}`.trim();
    byCourseId.set(conflict.programCourseId, {
      programCourseId: conflict.programCourseId,
      externalCourseLabel: label,
    });
  }

  return [...byCourseId.values()];
}

export async function setTranscriptProgramAction(formData: FormData) {
  const parsed = programSelectionSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    programId: formData.get("programId"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, programId } = parsed.data;

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState) {
      return { ok: false, reason: "missing_transcript" } as const;
    }

    const previousProgramId = planState.selectedProgramId;
    if (previousProgramId === programId) {
      return { ok: true, changed: false, previousProgramId } as const;
    }

    await tx.mappingPlan.update({
      where: { id: planState.mappingPlanId },
      data: {
        selectedProgramId: programId,
        status: MappingPlanStatus.DRAFT,
        approvedById: null,
        approvedAt: null,
      },
    });

    if (previousProgramId && previousProgramId !== programId) {
      const mappedDecisions = await tx.courseMappingDecision.findMany({
        where: {
          mappingPlanId: planState.mappingPlanId,
          status: CourseDecisionStatus.MAPPED,
        },
        select: {
          id: true,
        },
      });

      const mappedDecisionIds = mappedDecisions.map((decision) => decision.id);
      await tx.courseMappingSelection.deleteMany({
        where: {
          mappingPlanId: planState.mappingPlanId,
        },
      });

      if (mappedDecisionIds.length > 0) {
        await tx.courseMappingEvidence.deleteMany({
          where: {
            decisionId: {
              in: mappedDecisionIds,
            },
          },
        });
      }

      await tx.courseMappingDecision.updateMany({
        where: {
          mappingPlanId: planState.mappingPlanId,
          status: CourseDecisionStatus.MAPPED,
        },
        data: {
          status: CourseDecisionStatus.UNREVIEWED,
          awardedCredits: null,
          rationale: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });

      await tx.mappingPlanJourneyCourse.deleteMany({
        where: {
          mappingPlanId: planState.mappingPlanId,
        },
      });
      await tx.mappingPlanJourneyGroup.deleteMany({
        where: {
          mappingPlanId: planState.mappingPlanId,
        },
      });
    }

    return {
      ok: true,
      changed: true,
      previousProgramId,
      clearedExistingPlan: Boolean(previousProgramId && previousProgramId !== programId),
    } as const;
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "program_select",
    description: actionResult.ok
      ? actionResult.changed
        ? "Selected a program for a transcript mapping plan."
        : "Program selection was submitted with no change."
      : "Program selection was skipped because the transcript was not found.",
    area: "mapping",
    affectedType: "transcript",
    affectedId: transcriptId,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      programId,
      ...(actionResult.ok
        ? {
            previousProgramId: actionResult.previousProgramId,
            changed: actionResult.changed,
            clearedExistingPlan: actionResult.changed ? actionResult.clearedExistingPlan : false,
          }
        : { reason: actionResult.reason }),
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
}

export async function saveCourseMappingDecisionAction(formData: FormData) {
  const parsed = courseMappingDecisionSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    externalCourseId: formData.get("externalCourseId"),
    rationale: formData.get("rationale"),
    evidenceNote: formData.get("evidenceNote"),
    selectedProgramCourseIds: formData.get("selectedProgramCourseIds"),
    creditAllocations: formData.get("creditAllocations"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, externalCourseId, selectedProgramCourseIds, creditAllocations, rationale, evidenceNote } =
    parsed.data;
  const normalizedRationale = rationale?.trim() ?? "";
  const normalizedEvidenceNote = evidenceNote?.trim() ?? "";

  const uniqueSelectedProgramCourseIds = [...new Set(selectedProgramCourseIds)];
  if (!ensureAllocationsForSelections(uniqueSelectedProgramCourseIds, creditAllocations)) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "course_mapping_save",
      description: "Course mapping save was rejected because credit allocations were invalid.",
      area: "mapping",
      affectedType: "external_course",
      affectedId: externalCourseId,
      status: ActionHistoryStatus.WARNING,
      metadata: {
        transcriptId,
        selectedProgramCourseCount: uniqueSelectedProgramCourseIds.length,
      },
    });
    return;
  }

  const reviewedAt = new Date();
  try {
    const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState?.selectedProgramId) {
      return {
        ok: false,
        reason: "missing_program_selection",
      } as const;
    }

    const programCourses = await tx.programCourse.findMany({
      where: {
        id: { in: uniqueSelectedProgramCourseIds },
        programId: planState.selectedProgramId,
      },
      select: {
        id: true,
      },
    });

    if (programCourses.length !== uniqueSelectedProgramCourseIds.length) {
      return {
        ok: false,
        reason: "invalid_program_course_selection",
      } as const;
    }

    const courseDecision = await tx.courseMappingDecision.upsert({
      where: { externalCourseId },
      update: {},
      create: {
        mappingPlanId: planState.mappingPlanId,
        externalCourseId,
      },
      select: {
        id: true,
        mappingPlanId: true,
      },
    });

    const conflicts = await findLockedCourseConflicts({
      tx,
      mappingPlanId: planState.mappingPlanId,
      decisionId: courseDecision.id,
      selectedProgramCourseIds: uniqueSelectedProgramCourseIds,
    });

    if (conflicts.length > 0) {
      return {
        ok: false,
        reason: "course_already_mapped",
        courseIds: conflicts.map((conflict) => conflict.programCourseId),
      } as const;
    }

    await tx.courseMappingSelection.deleteMany({
      where: { decisionId: courseDecision.id },
    });

    await tx.courseMappingEvidence.deleteMany({
      where: { decisionId: courseDecision.id },
    });

    if (uniqueSelectedProgramCourseIds.length === 0) {
      await tx.courseMappingDecision.update({
        where: { id: courseDecision.id },
        data: {
          status: CourseDecisionStatus.UNREVIEWED,
          awardedCredits: null,
          rationale: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
    } else {
      await tx.courseMappingSelection.createMany({
        data: uniqueSelectedProgramCourseIds.map((programCourseId) => ({
          decisionId: courseDecision.id,
          mappingPlanId: courseDecision.mappingPlanId,
          programCourseId,
          awardedCredits: creditAllocations[programCourseId] ?? null,
        })),
      });

      const evidenceRows: Array<{
        decisionId: string;
        kind: EvidenceKind;
        snippet: string;
        sourceRef: string;
      }> = [];
      if (normalizedRationale.length > 0) {
        evidenceRows.push({
          decisionId: courseDecision.id,
          kind: EvidenceKind.ADMIN_NOTE,
          snippet: normalizedRationale,
          sourceRef: "reviewer-rationale",
        });
      }

      if (normalizedEvidenceNote.length > 0) {
        evidenceRows.push({
          decisionId: courseDecision.id,
          kind: EvidenceKind.ADMIN_NOTE,
          snippet: normalizedEvidenceNote,
          sourceRef: "reviewer-evidence-note",
        });
      }

      if (evidenceRows.length > 0) {
        await tx.courseMappingEvidence.createMany({
          data: evidenceRows,
        });
      }

      await tx.courseMappingDecision.update({
        where: { id: courseDecision.id },
        data: {
          status: CourseDecisionStatus.MAPPED,
          awardedCredits: null,
          rationale: normalizedRationale.length > 0 ? normalizedRationale : null,
          reviewedById: adminUser.id,
          reviewedAt,
        },
      });
    }

    await tx.mappingPlan.update({
      where: { id: courseDecision.mappingPlanId },
      data: {
        status: MappingPlanStatus.DRAFT,
        approvedById: null,
        approvedAt: null,
      },
    });

      return {
        ok: true,
      } as const;
    });

    if (!actionResult.ok) {
      await recordActionHistory({
        actor: adminUser,
        actionType: "course_mapping_save",
        description:
          actionResult.reason === "course_already_mapped"
            ? "Course mapping save was blocked because a selected catalog course is already mapped."
            : "Course mapping save was skipped because the mapping context was incomplete.",
        area: "mapping",
        affectedType: "external_course",
        affectedId: externalCourseId,
        status: ActionHistoryStatus.WARNING,
        metadata: {
          transcriptId,
          reason: actionResult.reason,
          selectedProgramCourseCount: uniqueSelectedProgramCourseIds.length,
          courseIds: "courseIds" in actionResult ? actionResult.courseIds : undefined,
        },
      });
      revalidatePath(`/transcripts/${transcriptId}`);
      revalidatePath("/transcripts");
      revalidatePath("/reports");
      redirect(
        transcriptNoticeHref({
          transcriptId,
          courseId: externalCourseId,
          notice: "mapping_save_blocked",
        }),
      );
    }

    await recordActionHistory({
      actor: adminUser,
      actionType: "course_mapping_save",
      description:
        uniqueSelectedProgramCourseIds.length === 0
          ? "Cleared course mapping selections and returned the course to Unreviewed."
          : "Saved course mapping selections.",
      area: "mapping",
      affectedType: "external_course",
      affectedId: externalCourseId,
      status: ActionHistoryStatus.SUCCESS,
      metadata: {
        transcriptId,
        selectedProgramCourseCount: uniqueSelectedProgramCourseIds.length,
        hasRationale: normalizedRationale.length > 0,
        hasEvidenceNote: normalizedEvidenceNote.length > 0,
      },
    });

    revalidatePath(`/transcripts/${transcriptId}`);
    revalidatePath("/transcripts");
    revalidatePath("/reports");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await recordActionHistory({
        actor: adminUser,
        actionType: "course_mapping_save",
        description: "Course mapping save was blocked by a duplicate catalog course constraint.",
        area: "mapping",
        affectedType: "external_course",
        affectedId: externalCourseId,
        status: ActionHistoryStatus.WARNING,
        metadata: {
          transcriptId,
          prismaCode: error.code,
        },
      });
      revalidatePath(`/transcripts/${transcriptId}`);
      revalidatePath("/transcripts");
      revalidatePath("/reports");
      redirect(
        transcriptNoticeHref({
          transcriptId,
          courseId: externalCourseId,
          notice: "mapping_save_conflict",
        }),
      );
    }

    throw error;
  }
}

export async function saveNoCreditDecisionAction(formData: FormData) {
  const parsed = noCreditDecisionSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    externalCourseId: formData.get("externalCourseId"),
    decisionType: formData.get("decisionType"),
    rationale: formData.get("rationale"),
    evidenceNote: formData.get("evidenceNote"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, externalCourseId, decisionType, rationale, evidenceNote } = parsed.data;
  const normalizedRationale = rationale?.trim() ?? "";
  const normalizedEvidenceNote = evidenceNote?.trim() ?? "";

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState) {
      return { ok: false, reason: "missing_transcript" } as const;
    }

    const isUnreviewed = decisionType === "unreviewed";
    const externalCourse = isUnreviewed
      ? null
      : await tx.externalCourse.findUnique({
          where: { id: externalCourseId },
          select: { credits: true },
        });
    const fallbackAwardedCredits = externalCourse?.credits != null ? Number(externalCourse.credits) : null;
    const resolvedCreditOnlyAward = decisionType === "credit_only" ? fallbackAwardedCredits : null;
    const resolvedStatus =
      decisionType === "credit_only"
        ? CourseDecisionStatus.CREDIT_ONLY
        : decisionType === "no_credit"
          ? CourseDecisionStatus.NO_CREDIT
          : CourseDecisionStatus.UNREVIEWED;
    const resolvedRationale = isUnreviewed ? null : normalizedRationale.length > 0 ? normalizedRationale : null;
    const resolvedReviewerId = isUnreviewed ? null : adminUser.id;
    const resolvedReviewedAt = isUnreviewed ? null : new Date();
    const previousDecision = await tx.courseMappingDecision.findUnique({
      where: { externalCourseId },
      select: {
        id: true,
        mappingPlanId: true,
        status: true,
        awardedCredits: true,
        rationale: true,
        selections: {
          select: {
            id: true,
          },
        },
        evidence: {
          where: {
            sourceRef: {
              in: ["reviewer-rationale", "reviewer-evidence-note"],
            },
          },
          select: {
            sourceRef: true,
            snippet: true,
          },
        },
      },
    });

    if (previousDecision && previousDecision.mappingPlanId === planState.mappingPlanId) {
      const previousAwardedCredits =
        previousDecision.awardedCredits == null ? null : Number(previousDecision.awardedCredits);
      const previousRationaleEvidence =
        previousDecision.evidence.find((entry) => entry.sourceRef === "reviewer-rationale")?.snippet.trim() ?? "";
      const previousEvidenceNote =
        previousDecision.evidence.find((entry) => entry.sourceRef === "reviewer-evidence-note")?.snippet.trim() ?? "";
      const targetRationaleEvidence = isUnreviewed ? "" : normalizedRationale;
      const targetEvidenceNote = isUnreviewed ? "" : normalizedEvidenceNote;
      const isNoop = isNoopDecisionUpdate({
        current: {
          status: previousDecision.status,
          awardedCredits: previousAwardedCredits,
          rationale: previousDecision.rationale,
          selectionCount: previousDecision.selections.length,
          rationaleEvidence: previousRationaleEvidence,
          evidenceNote: previousEvidenceNote,
        },
        target: {
          status: resolvedStatus,
          awardedCredits: resolvedCreditOnlyAward,
          rationale: resolvedRationale,
          selectionCount: 0,
          rationaleEvidence: targetRationaleEvidence,
          evidenceNote: targetEvidenceNote,
        },
      });

      if (isNoop) {
        return {
          ok: true,
          status: resolvedStatus,
          awardedCredits: resolvedCreditOnlyAward,
          noop: true,
        } as const;
      }
    }

    const courseDecision = await tx.courseMappingDecision.upsert({
      where: { externalCourseId },
      update: {
        status: resolvedStatus,
        awardedCredits: resolvedCreditOnlyAward,
        rationale: resolvedRationale,
        reviewedById: resolvedReviewerId,
        reviewedAt: resolvedReviewedAt,
      },
      create: {
        mappingPlanId: planState.mappingPlanId,
        externalCourseId,
        status: resolvedStatus,
        awardedCredits: resolvedCreditOnlyAward,
        rationale: resolvedRationale,
        reviewedById: resolvedReviewerId,
        reviewedAt: resolvedReviewedAt,
      },
      select: {
        id: true,
        mappingPlanId: true,
      },
    });

    await tx.courseMappingSelection.deleteMany({
      where: { decisionId: courseDecision.id },
    });
    await tx.courseMappingEvidence.deleteMany({
      where: { decisionId: courseDecision.id },
    });

    const evidenceRows: Array<{
      decisionId: string;
      kind: EvidenceKind;
      snippet: string;
      sourceRef: string;
    }> = [];

    if (!isUnreviewed && normalizedRationale.length > 0) {
      evidenceRows.push({
        decisionId: courseDecision.id,
        kind: EvidenceKind.ADMIN_NOTE,
        snippet: normalizedRationale,
        sourceRef: "reviewer-rationale",
      });
    }

    if (!isUnreviewed && normalizedEvidenceNote.length > 0) {
      evidenceRows.push({
        decisionId: courseDecision.id,
        kind: EvidenceKind.ADMIN_NOTE,
        snippet: normalizedEvidenceNote,
        sourceRef: "reviewer-evidence-note",
      });
    }

    if (evidenceRows.length > 0) {
      await tx.courseMappingEvidence.createMany({
        data: evidenceRows,
      });
    }

    await tx.mappingPlan.update({
      where: { id: courseDecision.mappingPlanId },
      data: {
        status: MappingPlanStatus.DRAFT,
        approvedById: null,
        approvedAt: null,
      },
    });

    return {
      ok: true,
      status: resolvedStatus,
      awardedCredits: resolvedCreditOnlyAward,
      noop: false,
    } as const;
  });

  if (actionResult.ok && actionResult.noop) {
    revalidatePath(`/transcripts/${transcriptId}`);
    revalidatePath("/transcripts");
    revalidatePath("/reports");
    redirect(
      transcriptNoticeHref({
        transcriptId,
        courseId: externalCourseId,
        notice: "decision_unchanged",
      }),
    );
  }

  await recordActionHistory({
    actor: adminUser,
    actionType: "course_decision_save",
    description: actionResult.ok
      ? `Saved ${decisionType.replace("_", " ")} decision for an extracted course.`
      : "Course decision save was skipped because the transcript was not found.",
    area: "mapping",
    affectedType: "external_course",
    affectedId: externalCourseId,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      transcriptId,
      decisionType,
      ...(actionResult.ok
        ? {
            resolvedStatus: actionResult.status,
            awardedCredits: actionResult.awardedCredits,
            hasRationale: normalizedRationale.length > 0,
            hasEvidenceNote: normalizedEvidenceNote.length > 0,
          }
        : { reason: actionResult.reason }),
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");

  if (!actionResult.ok) {
    redirect(
      transcriptNoticeHref({
        transcriptId,
        courseId: externalCourseId,
        notice: "decision_save_blocked",
      }),
    );
  }
}

export async function finalizeMappingPlanAction(formData: FormData) {
  const parsed = finalizePlanSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId } = parsed.data;

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState?.selectedProgramId) {
      return { ok: false, reason: "missing_program_selection" } as const;
    }

    if (planState.status === MappingPlanStatus.APPROVED) {
      return { ok: true, pendingCount: 0, noop: true } as const;
    }

    const pendingCount = await tx.courseMappingDecision.count({
      where: {
        mappingPlanId: planState.mappingPlanId,
        status: CourseDecisionStatus.UNREVIEWED,
      },
    });

    if (pendingCount > 0) {
      return { ok: false, reason: "pending_decisions", pendingCount } as const;
    }

    await tx.mappingPlan.update({
      where: {
        id: planState.mappingPlanId,
      },
      data: {
        status: MappingPlanStatus.APPROVED,
        approvedById: adminUser.id,
        approvedAt: new Date(),
      },
    });

    return { ok: true, pendingCount, noop: false } as const;
  });

  if (actionResult.ok && actionResult.noop) {
    revalidatePath(`/transcripts/${transcriptId}`);
    revalidatePath("/transcripts");
    revalidatePath("/reports");
    redirect(
      transcriptNoticeHref({
        transcriptId,
        notice: "plan_already_approved",
      }),
    );
  }

  await recordActionHistory({
    actor: adminUser,
    actionType: "mapping_plan_approve",
    description: actionResult.ok
      ? "Approved a transcript mapping plan."
      : "Mapping plan approval was skipped because the plan was not ready.",
    area: "mapping",
    affectedType: "transcript",
    affectedId: transcriptId,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: actionResult.ok
      ? { pendingCount: actionResult.pendingCount }
      : {
          reason: actionResult.reason,
          pendingCount: "pendingCount" in actionResult ? actionResult.pendingCount : undefined,
        },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");

  if (!actionResult.ok) {
    const notice = actionResult.reason === "pending_decisions" ? "plan_has_pending_decisions" : "plan_missing_program";
    redirect(
      transcriptNoticeHref({
        transcriptId,
        notice,
      }),
    );
  }
}

export async function toggleJourneyCourseAction(formData: FormData) {
  const parsed = toggleJourneyCourseSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    programCourseId: formData.get("programCourseId"),
    groupId: formData.get("groupId"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, programCourseId, groupId } = parsed.data;

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState?.selectedProgramId) {
      return { ok: false, reason: "missing_program_selection" } as const;
    }

    const programCourse = await tx.programCourse.findFirst({
      where: {
        id: programCourseId,
        programId: planState.selectedProgramId,
      },
      select: {
        id: true,
      },
    });
    if (!programCourse) {
      return { ok: false, reason: "invalid_program_course" } as const;
    }

    const existingJourneyCourse = await tx.mappingPlanJourneyCourse.findUnique({
      where: {
        mappingPlanId_programCourseId: {
          mappingPlanId: planState.mappingPlanId,
          programCourseId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingJourneyCourse) {
      await tx.mappingPlanJourneyCourse.delete({
        where: {
          id: existingJourneyCourse.id,
        },
      });
      await tx.mappingPlan.update({
        where: { id: planState.mappingPlanId },
        data: {
          status: MappingPlanStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
        },
      });
      return { ok: true, operation: "removed" } as const;
    }

    await normalizeJourneyPlanState({
      tx,
      mappingPlanId: planState.mappingPlanId,
      updatedById: adminUser.id,
    });

    const requestedGroup =
      groupId && groupId.length > 0
        ? await tx.mappingPlanJourneyGroup.findFirst({
            where: {
              id: groupId,
              mappingPlanId: planState.mappingPlanId,
            },
            select: { id: true, label: true, sortOrder: true },
          })
        : null;

    const targetGroup =
      requestedGroup ??
      (await ensureDefaultJourneyGroup({
        tx,
        mappingPlanId: planState.mappingPlanId,
        updatedById: adminUser.id,
      }));
    const lastGroupCourse = await tx.mappingPlanJourneyCourse.findFirst({
      where: {
        mappingPlanId: planState.mappingPlanId,
        journeyGroupId: targetGroup.id,
      },
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        sortOrder: true,
      },
    });

    await tx.mappingPlanJourneyCourse.create({
      data: {
        mappingPlanId: planState.mappingPlanId,
        journeyGroupId: targetGroup.id,
        programCourseId,
        sortOrder: (lastGroupCourse?.sortOrder ?? -1) + 1,
        updatedById: adminUser.id,
      },
    });

    await tx.mappingPlan.update({
      where: { id: planState.mappingPlanId },
      data: {
        status: MappingPlanStatus.DRAFT,
        approvedById: null,
        approvedAt: null,
      },
    });

    return {
      ok: true,
      operation: "added",
      groupId: targetGroup.id,
    } as const;
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "journey_course_toggle",
    description: actionResult.ok
      ? actionResult.operation === "added"
        ? "Added a catalog course to the student journey."
        : "Removed a catalog course from the student journey."
      : "Student journey course change was skipped.",
    area: "journey",
    affectedType: "program_course",
    affectedId: programCourseId,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      transcriptId,
      groupId: actionResult.ok && actionResult.operation === "added" ? actionResult.groupId : groupId || null,
      ...(actionResult.ok ? { operation: actionResult.operation } : { reason: actionResult.reason }),
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
}

type JourneyPlanGroup = {
  id: string;
  label: string;
  sortOrder: number;
};

type JourneyPlanCourse = {
  id: string;
  programCourseId: string;
  journeyGroupId: string | null;
  sortOrder: number;
};

function groupCoursesByGroup(
  groups: JourneyPlanGroup[],
  courses: JourneyPlanCourse[],
) {
  const grouped = new Map<string, JourneyPlanCourse[]>();
  for (const group of groups) {
    grouped.set(group.id, []);
  }

  for (const course of courses) {
    const groupId = course.journeyGroupId ?? groups[0]?.id ?? null;
    if (!groupId || !grouped.has(groupId)) {
      continue;
    }
    grouped.get(groupId)!.push(course);
  }

  for (const [groupId, rows] of grouped.entries()) {
    rows.sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    grouped.set(groupId, rows);
  }

  return grouped;
}

async function persistJourneyCourseOrdering(args: {
  tx: Prisma.TransactionClient;
  groups: JourneyPlanGroup[];
  groupedCourses: Map<string, JourneyPlanCourse[]>;
  updatedById: string;
}) {
  const updates: Array<Promise<unknown>> = [];
  for (const group of args.groups) {
    const rows = args.groupedCourses.get(group.id) ?? [];
    for (const [index, row] of rows.entries()) {
      updates.push(
        args.tx.mappingPlanJourneyCourse.update({
          where: { id: row.id },
          data: {
            journeyGroupId: group.id,
            sortOrder: index,
            updatedById: args.updatedById,
          },
        }),
      );
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

export async function createJourneyGroupAction(formData: FormData) {
  const parsed = createJourneyGroupSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, label } = parsed.data;

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState) {
      return { ok: false, reason: "missing_transcript" } as const;
    }

    await normalizeJourneyPlanState({
      tx,
      mappingPlanId: planState.mappingPlanId,
      updatedById: adminUser.id,
    });

    const maxGroup = await tx.mappingPlanJourneyGroup.findFirst({
      where: { mappingPlanId: planState.mappingPlanId },
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { sortOrder: true },
    });

    const group = await tx.mappingPlanJourneyGroup.create({
      data: {
        mappingPlanId: planState.mappingPlanId,
        label: normalizeGroupLabel(label),
        sortOrder: (maxGroup?.sortOrder ?? -1) + 1,
        updatedById: adminUser.id,
      },
      select: {
        id: true,
        label: true,
      },
    });

    await tx.mappingPlan.update({
      where: { id: planState.mappingPlanId },
      data: {
        status: MappingPlanStatus.DRAFT,
        approvedById: null,
        approvedAt: null,
      },
    });

    return { ok: true, groupId: group.id, label: group.label } as const;
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "journey_group_create",
    description: actionResult.ok
      ? "Created a student journey term."
      : "Student journey term creation was skipped because the transcript was not found.",
    area: "journey",
    affectedType: "journey_group",
    affectedId: actionResult.ok ? actionResult.groupId : null,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      transcriptId,
      label: actionResult.ok ? actionResult.label : label,
      ...(!actionResult.ok ? { reason: actionResult.reason } : {}),
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
}

export async function renameJourneyGroupAction(formData: FormData) {
  const parsed = renameJourneyGroupSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    groupId: formData.get("groupId"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, groupId, label } = parsed.data;

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState) {
      return { ok: false, reason: "missing_transcript" } as const;
    }

    const group = await tx.mappingPlanJourneyGroup.findFirst({
      where: {
        id: groupId,
        mappingPlanId: planState.mappingPlanId,
      },
      select: { id: true, label: true },
    });
    if (!group) {
      return { ok: false, reason: "missing_group" } as const;
    }

    const normalizedLabel = normalizeGroupLabel(label);
    await tx.mappingPlanJourneyGroup.update({
      where: { id: group.id },
      data: {
        label: normalizedLabel,
        updatedById: adminUser.id,
      },
    });

    await tx.mappingPlan.update({
      where: { id: planState.mappingPlanId },
      data: {
        status: MappingPlanStatus.DRAFT,
        approvedById: null,
        approvedAt: null,
      },
    });

    return { ok: true, previousLabel: group.label, label: normalizedLabel } as const;
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "journey_group_rename",
    description: actionResult.ok
      ? "Renamed a student journey term."
      : "Student journey term rename was skipped.",
    area: "journey",
    affectedType: "journey_group",
    affectedId: groupId,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      transcriptId,
      ...(actionResult.ok
        ? { previousLabel: actionResult.previousLabel, label: actionResult.label }
        : { reason: actionResult.reason, label }),
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
}

export async function deleteJourneyGroupAction(formData: FormData) {
  const parsed = deleteJourneyGroupSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    groupId: formData.get("groupId"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, groupId } = parsed.data;

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState) {
      return { ok: false, reason: "missing_transcript" } as const;
    }

    const group = await tx.mappingPlanJourneyGroup.findFirst({
      where: {
        id: groupId,
        mappingPlanId: planState.mappingPlanId,
      },
      select: { id: true, label: true },
    });
    if (!group) {
      return { ok: false, reason: "missing_group" } as const;
    }

    const usageCount = await tx.mappingPlanJourneyCourse.count({
      where: {
        mappingPlanId: planState.mappingPlanId,
        journeyGroupId: group.id,
      },
    });
    if (usageCount > 0) {
      return { ok: false, reason: "group_not_empty", usageCount } as const;
    }

    await tx.mappingPlanJourneyGroup.delete({
      where: { id: group.id },
    });

    await normalizeJourneyPlanState({
      tx,
      mappingPlanId: planState.mappingPlanId,
      updatedById: adminUser.id,
    });

    return { ok: true, label: group.label } as const;
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "journey_group_delete",
    description: actionResult.ok
      ? "Deleted an empty student journey term."
      : "Student journey term deletion was skipped.",
    area: "journey",
    affectedType: "journey_group",
    affectedId: groupId,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      transcriptId,
      ...(actionResult.ok
        ? { label: actionResult.label }
        : {
            reason: actionResult.reason,
            usageCount: "usageCount" in actionResult ? actionResult.usageCount : undefined,
          }),
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
}

export async function moveJourneyGroupAction(formData: FormData) {
  const parsed = moveJourneyGroupSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    groupId: formData.get("groupId"),
    direction: formData.get("direction"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, groupId, direction } = parsed.data;

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState) {
      return { ok: false, reason: "missing_transcript" } as const;
    }

    await normalizeJourneyPlanState({
      tx,
      mappingPlanId: planState.mappingPlanId,
      updatedById: adminUser.id,
    });

    const groups = await tx.mappingPlanJourneyGroup.findMany({
      where: { mappingPlanId: planState.mappingPlanId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, label: true, sortOrder: true },
    });
    const targetIndex = groups.findIndex((group) => group.id === groupId);
    if (targetIndex < 0) {
      return { ok: false, reason: "missing_group" } as const;
    }

    const swapIndex = direction === "up" ? targetIndex - 1 : targetIndex + 1;
    if (swapIndex < 0 || swapIndex >= groups.length) {
      return { ok: false, reason: "already_at_boundary" } as const;
    }

    const targetGroup = groups[targetIndex]!;
    const swapGroup = groups[swapIndex]!;
    await tx.mappingPlanJourneyGroup.update({
      where: { id: targetGroup.id },
      data: {
        sortOrder: swapGroup.sortOrder,
        updatedById: adminUser.id,
      },
    });
    await tx.mappingPlanJourneyGroup.update({
      where: { id: swapGroup.id },
      data: {
        sortOrder: targetGroup.sortOrder,
        updatedById: adminUser.id,
      },
    });

    await tx.mappingPlan.update({
      where: { id: planState.mappingPlanId },
      data: {
        status: MappingPlanStatus.DRAFT,
        approvedById: null,
        approvedAt: null,
      },
    });

    return { ok: true, label: targetGroup.label, fromIndex: targetIndex, toIndex: swapIndex } as const;
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "journey_group_move",
    description: actionResult.ok ? "Moved a student journey term." : "Student journey term move was skipped.",
    area: "journey",
    affectedType: "journey_group",
    affectedId: groupId,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      transcriptId,
      direction,
      ...(actionResult.ok
        ? { label: actionResult.label, fromIndex: actionResult.fromIndex, toIndex: actionResult.toIndex }
        : { reason: actionResult.reason }),
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
}

export async function moveJourneyCourseAction(formData: FormData) {
  const parsed = moveJourneyCourseSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    programCourseId: formData.get("programCourseId"),
    direction: formData.get("direction"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const { transcriptId, programCourseId, direction } = parsed.data;

  const actionResult = await db.$transaction(async (tx) => {
    const planState = await ensureMappingPlan(tx, transcriptId);
    if (!planState?.selectedProgramId) {
      return { ok: false, reason: "missing_program_selection" } as const;
    }

    const programCourse = await tx.programCourse.findFirst({
      where: {
        id: programCourseId,
        programId: planState.selectedProgramId,
      },
      select: { id: true },
    });
    if (!programCourse) {
      return { ok: false, reason: "invalid_program_course" } as const;
    }

    const orderedPlan = await getOrderedJourneyPlan({
      tx,
      mappingPlanId: planState.mappingPlanId,
      updatedById: adminUser.id,
    });
    if (orderedPlan.groups.length === 0) {
      return { ok: false, reason: "missing_journey_groups" } as const;
    }

    const groups: JourneyPlanGroup[] = orderedPlan.groups.map((group) => ({
      id: group.id,
      label: group.label,
      sortOrder: group.sortOrder,
    }));
    const courses: JourneyPlanCourse[] = orderedPlan.courses.map((course) => ({
      id: course.id,
      programCourseId: course.programCourseId,
      journeyGroupId: course.journeyGroupId ?? null,
      sortOrder: course.sortOrder,
    }));
    const groupedCourses = groupCoursesByGroup(groups, courses);

    const groupIndex = groups.findIndex((group) =>
      (groupedCourses.get(group.id) ?? []).some((course) => course.programCourseId === programCourseId),
    );
    if (groupIndex < 0) {
      return { ok: false, reason: "course_not_in_journey" } as const;
    }

    const currentGroup = groups[groupIndex]!;
    const currentRows = groupedCourses.get(currentGroup.id) ?? [];
    const rowIndex = currentRows.findIndex((course) => course.programCourseId === programCourseId);
    if (rowIndex < 0) {
      return { ok: false, reason: "course_not_in_group" } as const;
    }

    if (direction === "up") {
      if (rowIndex > 0) {
        const swapTarget = currentRows[rowIndex - 1];
        const moving = currentRows[rowIndex];
        if (!swapTarget || !moving) {
          return { ok: false, reason: "course_not_in_group" } as const;
        }
        currentRows[rowIndex - 1] = moving;
        currentRows[rowIndex] = swapTarget;
      } else {
        const [moving] = currentRows.splice(rowIndex, 1);
        if (!moving) {
          return { ok: false, reason: "course_not_in_group" } as const;
        }
        const previousGroup = groups[groupIndex - 1];
        if (!previousGroup) {
          currentRows.splice(0, 0, moving);
        } else {
          const previousRows = groupedCourses.get(previousGroup.id) ?? [];
          previousRows.push(moving);
          groupedCourses.set(previousGroup.id, previousRows);
        }
      }
      groupedCourses.set(currentGroup.id, currentRows);
    } else {
      if (rowIndex < currentRows.length - 1) {
        const swapTarget = currentRows[rowIndex + 1];
        const moving = currentRows[rowIndex];
        if (!swapTarget || !moving) {
          return { ok: false, reason: "course_not_in_group" } as const;
        }
        currentRows[rowIndex + 1] = moving;
        currentRows[rowIndex] = swapTarget;
      } else {
        const [moving] = currentRows.splice(rowIndex, 1);
        if (!moving) {
          return { ok: false, reason: "course_not_in_group" } as const;
        }
        const nextGroup = groups[groupIndex + 1];
        if (!nextGroup) {
          currentRows.push(moving);
        } else {
          const nextRows = groupedCourses.get(nextGroup.id) ?? [];
          nextRows.unshift(moving);
          groupedCourses.set(nextGroup.id, nextRows);
        }
      }
      groupedCourses.set(currentGroup.id, currentRows);
    }

    await persistJourneyCourseOrdering({
      tx,
      groups,
      groupedCourses,
      updatedById: adminUser.id,
    });

    await tx.mappingPlan.update({
      where: { id: planState.mappingPlanId },
      data: {
        status: MappingPlanStatus.DRAFT,
        approvedById: null,
        approvedAt: null,
      },
    });

    return { ok: true, fromGroupIndex: groupIndex, fromRowIndex: rowIndex } as const;
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "journey_course_move",
    description: actionResult.ok ? "Moved a student journey course." : "Student journey course move was skipped.",
    area: "journey",
    affectedType: "program_course",
    affectedId: programCourseId,
    status: actionResult.ok ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      transcriptId,
      direction,
      ...(actionResult.ok
        ? { fromGroupIndex: actionResult.fromGroupIndex, fromRowIndex: actionResult.fromRowIndex }
        : { reason: actionResult.reason }),
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
}
