import { CourseDecisionStatus, MappingPlanStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { CatalogRow } from "@/lib/catalog-parser";

export type CatalogImportSummary = {
  importedRows: number;
  programs: number;
  courses: number;
  outcomes: number;
  resetDecisionCount: number;
  resetPlanCount: number;
};

export async function importCatalogRows(options: {
  rows: CatalogRow[];
  replaceExisting: boolean;
  resetMappings: boolean;
}) {
  const { rows, replaceExisting, resetMappings } = options;
  const uniquePrograms = [...new Set(rows.map((row) => row.programName))];
  const courseGroups = new Map<
    string,
    {
      programName: string;
      courseCode: string;
      courseTitle: string;
      creditHours: number | null;
      outcomes: Array<{ outcomeCode: string | null; outcomeDescription: string }>;
    }
  >();

  for (const row of rows) {
    const courseKey = `${row.programName.toLowerCase()}|${row.courseCode.toLowerCase()}|${row.courseTitle.toLowerCase()}`;
    if (!courseGroups.has(courseKey)) {
      courseGroups.set(courseKey, {
        programName: row.programName,
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        creditHours: row.creditHours,
        outcomes: [],
      });
    }

    courseGroups.get(courseKey)!.outcomes.push({
      outcomeCode: row.outcomeCode,
      outcomeDescription: row.outcomeDescription,
    });
  }

  return db.$transaction(async (tx) => {
    if (replaceExisting) {
      await tx.programOutcome.deleteMany();
      await tx.programCourse.deleteMany();
      await tx.program.deleteMany();
    }

    const programIds = new Map<string, string>();
    for (const programName of uniquePrograms) {
      const program = await tx.program.upsert({
        where: { name: programName },
        update: {},
        create: {
          name: programName,
        },
      });
      programIds.set(programName, program.id);
    }

    const outcomeRows: Array<{
      programCourseId: string;
      outcomeCode: string | null;
      description: string;
    }> = [];

    for (const course of courseGroups.values()) {
      const programId = programIds.get(course.programName);
      if (!programId) {
        continue;
      }
      const programCourse = await tx.programCourse.upsert({
        where: {
          programId_code: {
            programId,
            code: course.courseCode,
          },
        },
        update: {
          title: course.courseTitle,
          creditHours: course.creditHours,
        },
        create: {
          programId,
          code: course.courseCode,
          title: course.courseTitle,
          creditHours: course.creditHours,
        },
      });

      outcomeRows.push(
        ...course.outcomes.map((outcome) => ({
          programCourseId: programCourse.id,
          outcomeCode: outcome.outcomeCode,
          description: outcome.outcomeDescription,
        })),
      );
    }

    if (outcomeRows.length > 0) {
      await tx.programOutcome.createMany({
        data: outcomeRows,
      });
    }

    let resetDecisionCount = 0;
    let resetPlanCount = 0;

    if (resetMappings) {
      await tx.courseMappingSelection.deleteMany();
      await tx.courseMappingEvidence.deleteMany();

      const resetDecisions = await tx.courseMappingDecision.updateMany({
        data: {
          status: CourseDecisionStatus.UNREVIEWED,
          rationale: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      const resetPlans = await tx.mappingPlan.updateMany({
        data: {
          status: MappingPlanStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
          selectedProgramId: null,
        },
      });

      resetDecisionCount = resetDecisions.count;
      resetPlanCount = resetPlans.count;
    }

    const [programs, courses, outcomes] = await Promise.all([
      tx.program.count(),
      tx.programCourse.count(),
      tx.programOutcome.count(),
    ]);

    return {
      importedRows: rows.length,
      programs,
      courses,
      outcomes,
      resetDecisionCount,
      resetPlanCount,
    } satisfies CatalogImportSummary;
  });
}
