import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { CourseDecisionStatus, EvidenceKind, MappingPlanStatus, ParserStatus, Prisma, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

import { formatGrade } from "@/lib/grade-format";
import { deleteStoredFile, saveUploadFile } from "@/lib/storage";

const COURSE_CODE_PATTERN = /\b([A-Z]{2,5}\s?\d{2,4}[A-Z]?)\b/;
const MACH_COURSE_CODE_PATTERN = /\b(MACH\s?\d{3}[A-Z]?)\b/i;
const MAP_HEADER_NAME = "Bates Prior Learning Course";

export type DemgyStudentImportConfig = {
  key: string;
  sheetName: string;
  mapColumnName?: string;
  firstName: string;
  lastName: string;
  pdfCandidates: string[];
};

export const DEMGY_STUDENT_IMPORT_CONFIG: DemgyStudentImportConfig[] = [
  {
    key: "rachel-ameline",
    sheetName: "Rachel Iine",
    mapColumnName: "Rachel Ameline",
    firstName: "Rachel",
    lastName: "Ameline",
    pdfCandidates: ["R. Ameline Unofficial Transcript.pdf", "R._Ameline_Unofficial_Transcript.pdf"],
  },
  {
    key: "christion-marcus",
    sheetName: "Christion Marcus",
    mapColumnName: "Marcus Christion",
    firstName: "Christion",
    lastName: "Marcus",
    pdfCandidates: ["M. Christion UNOFFICIAL TRANSCRIPT - 4.12.2025.pdf"],
  },
  {
    key: "shawna-lewis",
    sheetName: "Shawna Lewis",
    mapColumnName: "Shawna Lewis",
    firstName: "Shawna",
    lastName: "Lewis",
    pdfCandidates: ["S. Lewis Unofficial Transcript.pdf"],
  },
  {
    key: "michael-theissen",
    sheetName: "Michael Theissen",
    firstName: "Michael",
    lastName: "Theissen",
    pdfCandidates: ["M.Theisen Unofficial Transcript.pdf"],
  },
  {
    key: "martin-saulnier",
    sheetName: "Martin Saulnier",
    mapColumnName: "Martin Saulnier",
    firstName: "Martin",
    lastName: "Saulnier",
    pdfCandidates: ["M. Saulnier Unofficial Transcript - 4.18.2025.pdf"],
  },
  {
    key: "windy-schatz",
    sheetName: "Windy Schatz",
    mapColumnName: "Windy Schatz",
    firstName: "Windy",
    lastName: "Schatz",
    pdfCandidates: ["W. Schatz Transcript.pdf"],
  },
  {
    key: "paige-zorn",
    sheetName: "Paige Zorn",
    mapColumnName: "Paige Zorn",
    firstName: "Paige",
    lastName: "Zorn",
    pdfCandidates: ["P. Zorn Unofficial Transcript_BATES.AJAC.pdf"],
  },
];

export type WorkbookCourseRow = {
  sourceLabel: string;
  courseCode: string | null;
  title: string;
  credits: number | null;
  grade: string | null;
  isRepeated: boolean;
};

export type WorkbookMapRow = {
  sourceLabel: string;
  sourceCourseCode: string | null;
  miEquivalent: string;
  miEquivalentCode: string | null;
  studentValues: Record<string, string>;
};

export type ParsedWorkbookStudent = {
  key: string;
  sheetName: string;
  mapColumnName?: string;
  firstName: string;
  lastName: string;
  institutionName: string;
  courses: WorkbookCourseRow[];
};

export type ParsedWorkbookData = {
  students: ParsedWorkbookStudent[];
  mapRows: WorkbookMapRow[];
};

type PdfCandidate = {
  fileName: string;
  hash: string;
};

export type PdfChoiceResult = {
  selected: string;
  duplicateHashes: string[];
};

export type DecisionDraft = {
  status: CourseDecisionStatus;
  rationale: string | null;
  mappedProgramCourseCode: string | null;
  reasonCode:
    | "REPEATED_OR_ZERO_CREDIT"
    | "NO_MAP_ROW"
    | "NO_EQUIVALENT"
    | "DROPPED"
    | "PENDING_OR_EMPTY"
    | "MAPPED_NUMERIC"
    | "UNRECOGNIZED";
};

type ImportableStudent = ParsedWorkbookStudent & {
  pdfFileName: string;
  pdfAbsolutePath: string;
};

export type DemgyImportSummary = {
  importedStudents: number;
  transcriptsCreated: number;
  externalCoursesCreated: number;
  decisions: {
    mapped: number;
    noCredit: number;
    unreviewed: number;
  };
  unresolvedMiCourseCodes: string[];
  unresolvedMapSourceCourses: string[];
  duplicatePdfHashesDetected: number;
};

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseOptionalNumber(value: unknown) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCourseCode(rawCode: string) {
  const upper = rawCode.toUpperCase().replace(/\s+/g, "");
  const match = upper.match(/^([A-Z]{2,5})(\d{2,4}[A-Z]?)$/);
  if (!match) {
    return rawCode.toUpperCase().replace(/\s+/g, " ").trim();
  }
  return `${match[1]} ${match[2]}`.trim();
}

function parseCourseLabel(label: string) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return {
      sourceLabel: "",
      courseCode: null,
      title: "",
    };
  }

  const explicitSplitMatch = normalized.match(/^([A-Z]{2,5}\s?\d{2,4}[A-Z]?)\s*-\s*(.+)$/i);
  if (explicitSplitMatch) {
    return {
      sourceLabel: normalized,
      courseCode: normalizeCourseCode(explicitSplitMatch[1]),
      title: normalizeText(explicitSplitMatch[2]),
    };
  }

  const genericMatch = normalized.match(/^([A-Z]{2,5}\s?\d{2,4}[A-Z]?)\s+(.+)$/i);
  if (genericMatch) {
    return {
      sourceLabel: normalized,
      courseCode: normalizeCourseCode(genericMatch[1]),
      title: normalizeText(genericMatch[2]),
    };
  }

  const inlineCode = normalized.match(COURSE_CODE_PATTERN);
  return {
    sourceLabel: normalized,
    courseCode: inlineCode ? normalizeCourseCode(inlineCode[1]) : null,
    title: normalized,
  };
}

function normalizeCourseLabelKey(label: string) {
  return normalizeText(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractMachEquivalentCode(miEquivalent: string) {
  const match = miEquivalent.match(MACH_COURSE_CODE_PATTERN);
  return match ? normalizeCourseCode(match[1]) : null;
}

function parseMapSheet(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const mapHeaderIndex = rows.findIndex((row) => normalizeText(row[0]).toLowerCase() === MAP_HEADER_NAME.toLowerCase());
  if (mapHeaderIndex < 0) {
    throw new Error(`Workbook is missing "${MAP_HEADER_NAME}" header in Map sheet.`);
  }

  const headerRow = rows[mapHeaderIndex] ?? [];
  const studentHeaders = headerRow
    .map((value, index) => ({ label: normalizeText(value), index }))
    .filter((entry) => entry.index >= 4 && entry.label.length > 0);

  const mapRows: WorkbookMapRow[] = [];
  for (const row of rows.slice(mapHeaderIndex + 1)) {
    const sourceLabel = normalizeText(row[0]);
    if (!sourceLabel) {
      continue;
    }

    const miEquivalent = normalizeText(row[2]);
    const studentValues: Record<string, string> = {};
    for (const header of studentHeaders) {
      studentValues[header.label] = normalizeText(row[header.index]);
    }

    mapRows.push({
      sourceLabel,
      sourceCourseCode: parseCourseLabel(sourceLabel).courseCode,
      miEquivalent,
      miEquivalentCode: extractMachEquivalentCode(miEquivalent),
      studentValues,
    });
  }

  return mapRows;
}

function parseStudentSheet(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const firstNamedRow = rows.find((row) => normalizeText(row[0]).length > 0) ?? [];
  const institutionName = normalizeText(firstNamedRow[1]) || "Unknown Institution";

  const courseHeaderIndex = rows.findIndex((row) => normalizeText(row[0]).toLowerCase().includes("code - course"));
  if (courseHeaderIndex < 0) {
    throw new Error("Student sheet is missing 'Code - Course' header.");
  }

  const courses: WorkbookCourseRow[] = [];
  for (const row of rows.slice(courseHeaderIndex + 1)) {
    const label = normalizeText(row[0]);
    if (!label) {
      continue;
    }

    const lower = label.toLowerCase();
    if (lower.startsWith("attempted ") || lower.startsWith("term gpa")) {
      continue;
    }

    const parsedLabel = parseCourseLabel(label);
    const credits = parseOptionalNumber(row[1]);
    const gradeRaw = normalizeText(row[2]);
    const grade = formatGrade(gradeRaw);
    const repeated = lower.includes("(repeated)") || (credits !== null && credits <= 0);

    courses.push({
      sourceLabel: parsedLabel.sourceLabel,
      courseCode: parsedLabel.courseCode,
      title: parsedLabel.title,
      credits,
      grade,
      isRepeated: repeated,
    });
  }

  return {
    institutionName,
    courses,
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

export function parseDemgyWorkbook(buffer: Buffer, configs: DemgyStudentImportConfig[] = DEMGY_STUDENT_IMPORT_CONFIG) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const mapSheet = workbook.Sheets.Map;
  if (!mapSheet) {
    throw new Error("Workbook is missing required 'Map' sheet.");
  }

  const mapRows = parseMapSheet(mapSheet);
  const students: ParsedWorkbookStudent[] = [];

  for (const config of configs) {
    const sheet = workbook.Sheets[config.sheetName];
    if (!sheet) {
      throw new Error(`Workbook is missing expected student sheet: ${config.sheetName}`);
    }
    const parsed = parseStudentSheet(sheet);

    students.push({
      key: config.key,
      sheetName: config.sheetName,
      mapColumnName: config.mapColumnName,
      firstName: config.firstName,
      lastName: config.lastName,
      institutionName: parsed.institutionName,
      courses: parsed.courses,
    });
  }

  return {
    students,
    mapRows,
  } satisfies ParsedWorkbookData;
}

export function choosePdfCandidate(candidates: PdfCandidate[]) {
  if (candidates.length === 0) {
    throw new Error("No PDF candidates available.");
  }
  const duplicateHashes = new Set<string>();
  if (candidates.length > 1) {
    const firstHash = candidates[0].hash;
    for (const candidate of candidates.slice(1)) {
      if (candidate.hash === firstHash) {
        duplicateHashes.add(candidate.hash);
      }
    }
  }

  return {
    selected: candidates[0].fileName,
    duplicateHashes: [...duplicateHashes],
  } satisfies PdfChoiceResult;
}

function classifyMapValue(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return "empty" as const;
  }
  if (normalized === "pending") {
    return "pending" as const;
  }
  if (normalized === "dropped") {
    return "dropped" as const;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return "numeric" as const;
  }
  return "other" as const;
}

function isNoEquivalent(miEquivalent: string) {
  return normalizeText(miEquivalent).toLowerCase().includes("no equivalent");
}

export function deriveDecisionFromMap(args: {
  course: WorkbookCourseRow;
  mapRow: WorkbookMapRow | null;
  mapValue: string;
}) {
  const { course, mapRow, mapValue } = args;

  if (course.isRepeated) {
    return {
      status: CourseDecisionStatus.NO_CREDIT,
      rationale: `No credit imported because "${course.sourceLabel}" is marked repeated or has zero earned credit in workbook details.`,
      mappedProgramCourseCode: null,
      reasonCode: "REPEATED_OR_ZERO_CREDIT",
    } satisfies DecisionDraft;
  }

  if (!mapRow) {
    return {
      status: CourseDecisionStatus.UNREVIEWED,
      rationale: null,
      mappedProgramCourseCode: null,
      reasonCode: "NO_MAP_ROW",
    } satisfies DecisionDraft;
  }

  if (isNoEquivalent(mapRow.miEquivalent)) {
    return {
      status: CourseDecisionStatus.NO_CREDIT,
      rationale: `No credit imported because map row "${mapRow.sourceLabel}" is marked as No equivalent.`,
      mappedProgramCourseCode: null,
      reasonCode: "NO_EQUIVALENT",
    } satisfies DecisionDraft;
  }

  const classifiedMapValue = classifyMapValue(mapValue);
  if (classifiedMapValue === "dropped") {
    return {
      status: CourseDecisionStatus.NO_CREDIT,
      rationale: `No credit imported because map cell is "Dropped" for "${mapRow.sourceLabel}".`,
      mappedProgramCourseCode: null,
      reasonCode: "DROPPED",
    } satisfies DecisionDraft;
  }

  if (classifiedMapValue === "pending" || classifiedMapValue === "empty") {
    return {
      status: CourseDecisionStatus.UNREVIEWED,
      rationale: null,
      mappedProgramCourseCode: null,
      reasonCode: "PENDING_OR_EMPTY",
    } satisfies DecisionDraft;
  }

  if (classifiedMapValue === "numeric") {
    return {
      status: CourseDecisionStatus.MAPPED,
      rationale: `Imported mapped MI hours from workbook map row "${mapRow.sourceLabel}" to "${mapRow.miEquivalent}" (cell value "${normalizeText(mapValue)}").`,
      mappedProgramCourseCode: mapRow.miEquivalentCode,
      reasonCode: "MAPPED_NUMERIC",
    } satisfies DecisionDraft;
  }

  return {
    status: CourseDecisionStatus.UNREVIEWED,
    rationale: null,
    mappedProgramCourseCode: null,
    reasonCode: "UNRECOGNIZED",
  } satisfies DecisionDraft;
}

async function hashFileSha1(filePath: string) {
  const buffer = await readFile(filePath);
  return createHash("sha1").update(buffer).digest("hex");
}

async function resolveImportableStudents(args: {
  sourceDirectory: string;
  parsedWorkbook: ParsedWorkbookData;
  config: DemgyStudentImportConfig[];
}) {
  const { sourceDirectory, parsedWorkbook, config } = args;
  const availableFiles = new Set(await readdir(sourceDirectory));
  const hashCache = new Map<string, string>();
  const duplicateHashes = new Set<string>();

  const studentsByKey = new Map(parsedWorkbook.students.map((student) => [student.key, student]));
  const importableStudents: ImportableStudent[] = [];

  for (const studentConfig of config) {
    const student = studentsByKey.get(studentConfig.key);
    if (!student) {
      throw new Error(`Workbook parsed data is missing configured student key "${studentConfig.key}".`);
    }

    const candidateFileNames = studentConfig.pdfCandidates.filter((candidate) => availableFiles.has(candidate));
    if (candidateFileNames.length === 0) {
      throw new Error(
        `Missing required transcript PDF for ${student.firstName} ${student.lastName}. Expected one of: ${studentConfig.pdfCandidates.join(", ")}`,
      );
    }

    const candidateHashes: PdfCandidate[] = [];
    for (const fileName of candidateFileNames) {
      const absolutePath = path.join(sourceDirectory, fileName);
      const existingHash = hashCache.get(absolutePath);
      const hash = existingHash ?? (await hashFileSha1(absolutePath));
      hashCache.set(absolutePath, hash);
      candidateHashes.push({ fileName, hash });
    }

    const choice = choosePdfCandidate(candidateHashes);
    for (const duplicateHash of choice.duplicateHashes) {
      duplicateHashes.add(duplicateHash);
    }

    importableStudents.push({
      ...student,
      pdfFileName: choice.selected,
      pdfAbsolutePath: path.join(sourceDirectory, choice.selected),
    });
  }

  return {
    students: importableStudents,
    duplicateHashesDetected: duplicateHashes.size,
  };
}

async function clearTranscriptDomainData(tx: Prisma.TransactionClient) {
  await tx.courseMappingSelection.deleteMany();
  await tx.courseMappingEvidence.deleteMany();
  await tx.courseMappingDecision.deleteMany();
  await tx.mappingEvidence.deleteMany();
  await tx.mappingDecision.deleteMany();
  await tx.report.deleteMany();
  await tx.mappingPlan.deleteMany();
  await tx.externalCourse.deleteMany();
  await tx.transcriptFile.deleteMany();
  await tx.transcript.deleteMany();
  await tx.student.deleteMany();
  await tx.institution.deleteMany();
}

export async function importDemgyTranscriptBatch(options: {
  prisma?: PrismaClient;
  workbookPath: string;
  sourceDirectory: string;
  config?: DemgyStudentImportConfig[];
}) {
  const prisma = options.prisma ?? new PrismaClient();
  const config = options.config ?? DEMGY_STUDENT_IMPORT_CONFIG;
  const workbookBuffer = await readFile(options.workbookPath);
  const parsedWorkbook = parseDemgyWorkbook(workbookBuffer, config);
  const resolved = await resolveImportableStudents({
    sourceDirectory: options.sourceDirectory,
    parsedWorkbook,
    config,
  });

  const existingFilePaths = await prisma.transcript.findMany({
    select: {
      fileUrl: true,
    },
  });
  const existingTranscriptFilePaths = await prisma.transcriptFile.findMany({
    select: {
      fileUrl: true,
    },
  });
  const existingReportPaths = await prisma.report.findMany({
    select: {
      fileUrl: true,
    },
  });

  const machProgram = await prisma.program.findFirst({
    where: {
      name: "MACH - Machinist",
    },
    include: {
      courses: true,
    },
  });
  if (!machProgram) {
    throw new Error("Required program 'MACH - Machinist' is missing from catalog.");
  }

  const machCoursesByCode = new Map<string, (typeof machProgram.courses)[number]>();
  for (const course of machProgram.courses) {
    machCoursesByCode.set(normalizeCourseCode(course.code), course);
  }

  const mapIndexes = buildMapIndexes(parsedWorkbook.mapRows);
  const now = new Date();
  const unresolvedMiCourseCodes = new Set<string>();
  const unresolvedMapSourceCourses = new Set<string>();
  const decisionCounts = {
    mapped: 0,
    noCredit: 0,
    unreviewed: 0,
  };

  const transcriptPayloads = await Promise.all(
    resolved.students.map(async (student) => {
      const pdfBuffer = await readFile(student.pdfAbsolutePath);
      const fileUrl = await saveUploadFile("transcripts", student.pdfFileName, pdfBuffer);
      return {
        ...student,
        fileUrl,
      };
    }),
  );

  let externalCoursesCreated = 0;
  await prisma.$transaction(async (tx) => {
    await clearTranscriptDomainData(tx);

    for (const student of transcriptPayloads) {
      const institution = await tx.institution.upsert({
        where: {
          name: student.institutionName,
        },
        update: {},
        create: {
          name: student.institutionName,
        },
      });

      const createdStudent = await tx.student.create({
        data: {
          firstName: student.firstName,
          lastName: student.lastName,
        },
      });

      const transcript = await tx.transcript.create({
        data: {
          studentId: createdStudent.id,
          institutionId: institution.id,
          fileName: student.pdfFileName,
          fileUrl: student.fileUrl,
          parserStatus: ParserStatus.PARSED,
          rawText: null,
          uploadedAt: now,
        },
      });

      const mappingPlan = await tx.mappingPlan.create({
        data: {
          transcriptId: transcript.id,
          selectedProgramId: machProgram.id,
          status: MappingPlanStatus.DRAFT,
        },
      });
      const transcriptFile = await tx.transcriptFile.create({
        data: {
          transcriptId: transcript.id,
          fileName: student.pdfFileName,
          fileUrl: student.fileUrl,
          parserStatus: ParserStatus.PARSED,
          rawText: null,
          uploadedAt: now,
        },
      });

      const usedProgramCourseIds = new Set<string>();
      for (const courseRow of student.courses) {
        const mapRow =
          (courseRow.courseCode ? mapIndexes.byCourseCode.get(courseRow.courseCode) : null) ??
          mapIndexes.byLabel.get(normalizeCourseLabelKey(courseRow.sourceLabel)) ??
          null;
        const mapValue = student.mapColumnName ? normalizeText(mapRow?.studentValues[student.mapColumnName]) : "";
        const draftDecision = deriveDecisionFromMap({
          course: courseRow,
          mapRow,
          mapValue,
        });

        const externalCourse = await tx.externalCourse.create({
          data: {
            transcriptId: transcript.id,
            transcriptFileId: transcriptFile.id,
            courseCode: courseRow.courseCode,
            title: courseRow.title,
            credits: courseRow.credits,
            grade: courseRow.grade,
            sourceSnippet: `Workbook ${student.sheetName}: ${courseRow.sourceLabel}`,
          },
        });
        externalCoursesCreated += 1;

        let status = draftDecision.status;
        let rationale = draftDecision.rationale;
        let programCourseId: string | null = null;

        if (status === CourseDecisionStatus.MAPPED) {
          if (!draftDecision.mappedProgramCourseCode) {
            status = CourseDecisionStatus.UNREVIEWED;
            rationale = null;
            unresolvedMapSourceCourses.add(mapRow?.sourceLabel ?? courseRow.sourceLabel);
          } else {
            const matchedProgramCourse = machCoursesByCode.get(draftDecision.mappedProgramCourseCode);
            if (!matchedProgramCourse) {
              status = CourseDecisionStatus.UNREVIEWED;
              rationale = null;
              unresolvedMiCourseCodes.add(draftDecision.mappedProgramCourseCode);
            } else if (usedProgramCourseIds.has(matchedProgramCourse.id)) {
              status = CourseDecisionStatus.UNREVIEWED;
              rationale = null;
              unresolvedMapSourceCourses.add(mapRow?.sourceLabel ?? courseRow.sourceLabel);
            } else {
              programCourseId = matchedProgramCourse.id;
              usedProgramCourseIds.add(programCourseId);
            }
          }
        }

        if (status === CourseDecisionStatus.MAPPED) {
          decisionCounts.mapped += 1;
        } else if (status === CourseDecisionStatus.NO_CREDIT) {
          decisionCounts.noCredit += 1;
        } else {
          decisionCounts.unreviewed += 1;
        }

        const decision = await tx.courseMappingDecision.create({
          data: {
            mappingPlanId: mappingPlan.id,
            externalCourseId: externalCourse.id,
            status,
            rationale,
            reviewedAt: status === CourseDecisionStatus.UNREVIEWED ? null : now,
          },
        });

        if (status === CourseDecisionStatus.MAPPED && programCourseId) {
          const selectedProgramCourse = machProgram.courses.find((course) => course.id === programCourseId);
          await tx.courseMappingSelection.create({
            data: {
              decisionId: decision.id,
              mappingPlanId: mappingPlan.id,
              programCourseId,
              awardedCredits: selectedProgramCourse?.creditHours ?? null,
            },
          });
        }

        if (status !== CourseDecisionStatus.UNREVIEWED && rationale) {
          await tx.courseMappingEvidence.create({
            data: {
              decisionId: decision.id,
              kind: EvidenceKind.ADMIN_NOTE,
              snippet: `${rationale} [source: Demgy workbook map]`,
              sourceRef: "demgy-workbook-map",
            },
          });
        }
      }
    }
  });

  for (const file of existingFilePaths) {
    await deleteStoredFile(file.fileUrl).catch(() => {});
  }
  for (const file of existingTranscriptFilePaths) {
    await deleteStoredFile(file.fileUrl).catch(() => {});
  }
  for (const report of existingReportPaths) {
    await deleteStoredFile(report.fileUrl).catch(() => {});
  }

  const summary = {
    importedStudents: transcriptPayloads.length,
    transcriptsCreated: transcriptPayloads.length,
    externalCoursesCreated,
    decisions: decisionCounts,
    unresolvedMiCourseCodes: [...unresolvedMiCourseCodes].sort(),
    unresolvedMapSourceCourses: [...unresolvedMapSourceCourses].sort(),
    duplicatePdfHashesDetected: resolved.duplicateHashesDetected,
  } satisfies DemgyImportSummary;

  if (!options.prisma) {
    await prisma.$disconnect();
  }

  return summary;
}
