import { readFile } from "node:fs/promises";
import path from "node:path";

import { CourseDecisionStatus, PrismaClient } from "@prisma/client";

import {
  DEMGY_STUDENT_IMPORT_CONFIG,
  deriveDecisionFromMap,
  parseDemgyWorkbook,
  type WorkbookMapRow,
} from "../src/lib/workbook-transcript-import";

type CliArgs = {
  workbookPath: string;
};

type CheckIssue = {
  student: string;
  category: string;
  detail: string;
};

type CourseLike = {
  courseCode: string | null;
  title: string;
  credits: unknown;
  grade: string | null;
  sourceSnippet: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      continue;
    }
    args.set(key.slice(2), value);
    index += 1;
  }

  const workbookPath = args.get("workbook");
  if (!workbookPath) {
    throw new Error(
      'Usage: npx tsx scripts/verify-demgy-transcripts.ts --workbook "C:\\Users\\thecn\\Codex_002\\Demgy - Apprentice Transcript Course Completion.xlsx"',
    );
  }

  return {
    workbookPath: path.resolve(workbookPath),
  };
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeName(value: string) {
  return normalizeText(value).toLowerCase();
}

function normalizeCourseCode(rawCode: string) {
  const upper = rawCode.toUpperCase().replace(/\s+/g, "");
  const match = upper.match(/^([A-Z]{2,5})(\d{2,4}[A-Z]?)$/);
  if (!match) {
    return rawCode.toUpperCase().replace(/\s+/g, " ").trim();
  }
  return `${match[1]} ${match[2]}`.trim();
}

function normalizeCourseLabelKey(label: string) {
  return normalizeText(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeOptionalCourseCode(code: string | null | undefined) {
  const text = normalizeText(code);
  if (!text) {
    return null;
  }
  return normalizeCourseCode(text);
}

function normalizeOptionalString(value: string | null | undefined) {
  const text = normalizeText(value);
  return text ? text : null;
}

function numericText(value: unknown) {
  if (value == null) {
    return null;
  }
  const numeric = Number(String(value));
  return Number.isFinite(numeric) ? numeric.toString() : null;
}

function studentKey(firstName: string, lastName: string) {
  return `${normalizeName(firstName)}|${normalizeName(lastName)}`;
}

function courseSignature(course: CourseLike) {
  return [
    normalizeOptionalCourseCode(course.courseCode) ?? "",
    normalizeText(course.title).toLowerCase(),
    numericText(course.credits) ?? "",
    normalizeOptionalString(course.grade)?.toLowerCase() ?? "",
    normalizeOptionalString(course.sourceSnippet)?.toLowerCase() ?? "",
  ].join("|");
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function compareMultisets(args: {
  expected: string[];
  actual: string[];
}) {
  const expectedCounts = new Map<string, number>();
  const actualCounts = new Map<string, number>();
  for (const entry of args.expected) {
    incrementCount(expectedCounts, entry);
  }
  for (const entry of args.actual) {
    incrementCount(actualCounts, entry);
  }

  const missing: string[] = [];
  const extra: string[] = [];
  const allKeys = new Set([...expectedCounts.keys(), ...actualCounts.keys()]);
  for (const key of allKeys) {
    const expectedCount = expectedCounts.get(key) ?? 0;
    const actualCount = actualCounts.get(key) ?? 0;
    if (expectedCount > actualCount) {
      for (let index = 0; index < expectedCount - actualCount; index += 1) {
        missing.push(key);
      }
    } else if (actualCount > expectedCount) {
      for (let index = 0; index < actualCount - expectedCount; index += 1) {
        extra.push(key);
      }
    }
  }

  return {
    missing,
    extra,
  };
}

function buildMapIndexes(mapRows: WorkbookMapRow[]) {
  const byCourseCode = new Map<string, WorkbookMapRow>();
  const byLabel = new Map<string, WorkbookMapRow>();

  for (const row of mapRows) {
    if (row.sourceCourseCode && !byCourseCode.has(row.sourceCourseCode)) {
      byCourseCode.set(row.sourceCourseCode, row);
    }
    const labelKey = normalizeCourseLabelKey(row.sourceLabel);
    if (labelKey && !byLabel.has(labelKey)) {
      byLabel.set(labelKey, row);
    }
  }

  return {
    byCourseCode,
    byLabel,
  };
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function summarizeSignatures(signatures: string[]) {
  return signatures.slice(0, 5).join(" || ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbookBuffer = await readFile(args.workbookPath);
  const parsedWorkbook = parseDemgyWorkbook(workbookBuffer, DEMGY_STUDENT_IMPORT_CONFIG);
  const mapIndexes = buildMapIndexes(parsedWorkbook.mapRows);
  const expectedStudents = parsedWorkbook.students;
  const expectedStudentKeySet = new Set(
    expectedStudents.map((student) => studentKey(student.firstName, student.lastName)),
  );

  const prisma = new PrismaClient();
  try {
    const machProgram = await prisma.program.findFirst({
      where: {
        name: "MACH - Machinist",
      },
      include: {
        courses: true,
      },
    });
    if (!machProgram) {
      throw new Error("Catalog program 'MACH - Machinist' is missing.");
    }

    const machCoursesByCode = new Map<string, (typeof machProgram.courses)[number]>();
    for (const course of machProgram.courses) {
      machCoursesByCode.set(normalizeCourseCode(course.code), course);
    }

    const transcripts = await prisma.transcript.findMany({
      include: {
        student: true,
        institution: true,
        mappingPlan: {
          include: {
            selectedProgram: true,
          },
        },
        externalCourses: {
          include: {
            courseMappingDecision: {
              include: {
                selections: {
                  include: {
                    programCourse: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        uploadedAt: "asc",
      },
    });

    const issues: CheckIssue[] = [];

    const nonBatchTranscripts = transcripts.filter((transcript) => {
      const key = studentKey(transcript.student.firstName, transcript.student.lastName);
      return !expectedStudentKeySet.has(key);
    });
    if (nonBatchTranscripts.length > 0) {
      issues.push({
        student: "ALL",
        category: "queue",
        detail: `Found ${nonBatchTranscripts.length} extra transcript(s) outside expected cohort: ${nonBatchTranscripts
          .map((transcript) => `${transcript.student.firstName} ${transcript.student.lastName}`)
          .join(", ")}`,
      });
    }

    for (const workbookStudent of expectedStudents) {
      const readableStudentName = `${workbookStudent.firstName} ${workbookStudent.lastName}`;
      const matchingTranscripts = transcripts.filter(
        (transcript) =>
          normalizeName(transcript.student.firstName) === normalizeName(workbookStudent.firstName) &&
          normalizeName(transcript.student.lastName) === normalizeName(workbookStudent.lastName),
      );

      if (matchingTranscripts.length === 0) {
        issues.push({
          student: readableStudentName,
          category: "transcript",
          detail: "Missing transcript row in queue.",
        });
        continue;
      }
      if (matchingTranscripts.length > 1) {
        issues.push({
          student: readableStudentName,
          category: "transcript",
          detail: `Expected one transcript row, found ${matchingTranscripts.length}.`,
        });
      }

      const transcript = matchingTranscripts[0];
      if (!transcript.mappingPlan) {
        issues.push({
          student: readableStudentName,
          category: "plan",
          detail: "Mapping plan missing.",
        });
      } else if (transcript.mappingPlan.selectedProgram?.name !== "MACH - Machinist") {
        issues.push({
          student: readableStudentName,
          category: "plan",
          detail: `Selected program mismatch. Expected "MACH - Machinist", got "${transcript.mappingPlan.selectedProgram?.name ?? "None"}".`,
        });
      }

      if (normalizeText(transcript.institution.name) !== normalizeText(workbookStudent.institutionName)) {
        issues.push({
          student: readableStudentName,
          category: "institution",
          detail: `Institution mismatch. Expected "${workbookStudent.institutionName}", got "${transcript.institution.name}".`,
        });
      }

      const expectedCourseSignatures = workbookStudent.courses.map((courseRow) =>
        courseSignature({
          courseCode: courseRow.courseCode,
          title: courseRow.title,
          credits: courseRow.credits,
          grade: courseRow.grade,
          sourceSnippet: `Workbook ${workbookStudent.sheetName}: ${courseRow.sourceLabel}`,
        }),
      );
      const actualCourseSignatures = transcript.externalCourses.map((courseRow) =>
        courseSignature({
          courseCode: courseRow.courseCode,
          title: courseRow.title,
          credits: courseRow.credits,
          grade: courseRow.grade,
          sourceSnippet: courseRow.sourceSnippet,
        }),
      );

      const courseSetDiff = compareMultisets({
        expected: expectedCourseSignatures,
        actual: actualCourseSignatures,
      });
      if (courseSetDiff.missing.length > 0 || courseSetDiff.extra.length > 0) {
        issues.push({
          student: readableStudentName,
          category: "courses",
          detail: `Course rows do not match workbook exactly. Missing=${courseSetDiff.missing.length}, Extra=${courseSetDiff.extra.length}. Missing sample: ${summarizeSignatures(courseSetDiff.missing)}. Extra sample: ${summarizeSignatures(courseSetDiff.extra)}.`,
        });
      }

      const actualCoursesBySignature = new Map<
        string,
        Array<
          (typeof transcript.externalCourses)[number] & {
            courseMappingDecision: (typeof transcript.externalCourses)[number]["courseMappingDecision"];
          }
        >
      >();
      for (const externalCourse of transcript.externalCourses) {
        const signature = courseSignature({
          courseCode: externalCourse.courseCode,
          title: externalCourse.title,
          credits: externalCourse.credits,
          grade: externalCourse.grade,
          sourceSnippet: externalCourse.sourceSnippet,
        });
        const bucket = actualCoursesBySignature.get(signature) ?? [];
        bucket.push(externalCourse);
        actualCoursesBySignature.set(signature, bucket);
      }

      const usedProgramCourseIds = new Set<string>();
      for (const expectedCourse of workbookStudent.courses) {
        const expectedSignature = courseSignature({
          courseCode: expectedCourse.courseCode,
          title: expectedCourse.title,
          credits: expectedCourse.credits,
          grade: expectedCourse.grade,
          sourceSnippet: `Workbook ${workbookStudent.sheetName}: ${expectedCourse.sourceLabel}`,
        });

        const matchedBucket = actualCoursesBySignature.get(expectedSignature) ?? [];
        const matchedExternalCourse = matchedBucket.shift();
        if (matchedBucket.length === 0) {
          actualCoursesBySignature.delete(expectedSignature);
        } else {
          actualCoursesBySignature.set(expectedSignature, matchedBucket);
        }

        if (!matchedExternalCourse) {
          continue;
        }

        const mapRow =
          (expectedCourse.courseCode ? mapIndexes.byCourseCode.get(expectedCourse.courseCode) : null) ??
          mapIndexes.byLabel.get(normalizeCourseLabelKey(expectedCourse.sourceLabel)) ??
          null;
        const mapValue = workbookStudent.mapColumnName
          ? normalizeText(mapRow?.studentValues[workbookStudent.mapColumnName])
          : "";

        const draft = deriveDecisionFromMap({
          course: expectedCourse,
          mapRow,
          mapValue,
        });

        let expectedStatus = draft.status;
        let expectedProgramCourseCode: string | null = null;

        if (expectedStatus === CourseDecisionStatus.MAPPED) {
          if (!draft.mappedProgramCourseCode) {
            expectedStatus = CourseDecisionStatus.UNREVIEWED;
          } else {
            const machCourse = machCoursesByCode.get(draft.mappedProgramCourseCode);
            if (!machCourse) {
              expectedStatus = CourseDecisionStatus.UNREVIEWED;
            } else if (usedProgramCourseIds.has(machCourse.id)) {
              expectedStatus = CourseDecisionStatus.UNREVIEWED;
            } else {
              expectedProgramCourseCode = normalizeCourseCode(machCourse.code);
              usedProgramCourseIds.add(machCourse.id);
            }
          }
        }

        const decision = matchedExternalCourse.courseMappingDecision;
        if (!decision) {
          issues.push({
            student: readableStudentName,
            category: "decision",
            detail: `Missing decision for external course "${expectedCourse.sourceLabel}".`,
          });
          continue;
        }

        if (decision.status !== expectedStatus) {
          issues.push({
            student: readableStudentName,
            category: "decision",
            detail: `Status mismatch for "${expectedCourse.sourceLabel}". Expected ${expectedStatus}, got ${decision.status}.`,
          });
        }

        const actualSelectedProgramCodes = decision.selections
          .map((selection) => normalizeCourseCode(selection.programCourse.code))
          .sort();
        const expectedSelectedProgramCodes = expectedProgramCourseCode ? [expectedProgramCourseCode] : [];
        if (!arraysEqual(actualSelectedProgramCodes, expectedSelectedProgramCodes)) {
          issues.push({
            student: readableStudentName,
            category: "selection",
            detail: `Selection mismatch for "${expectedCourse.sourceLabel}". Expected [${expectedSelectedProgramCodes.join(", ")}], got [${actualSelectedProgramCodes.join(", ")}].`,
          });
        }
      }
    }

    const studentSummaries = expectedStudents.map((student) => {
      const readableStudentName = `${student.firstName} ${student.lastName}`;
      const transcript = transcripts.find(
        (row) =>
          normalizeName(row.student.firstName) === normalizeName(student.firstName) &&
          normalizeName(row.student.lastName) === normalizeName(student.lastName),
      );
      return {
        student: readableStudentName,
        workbookCourses: student.courses.length,
        queuedCourses: transcript?.externalCourses.length ?? 0,
        queueEntryFound: Boolean(transcript),
      };
    });

    const result = {
      workbook: args.workbookPath,
      expectedStudents: expectedStudents.length,
      queueEntriesChecked: transcripts.length,
      passed: issues.length === 0,
      issueCount: issues.length,
      students: studentSummaries,
      issues,
    };

    console.log(JSON.stringify(result, null, 2));

    if (issues.length > 0) {
      process.exit(2);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
