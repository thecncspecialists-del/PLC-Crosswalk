import * as XLSX from "xlsx";

export type CatalogRow = {
  programName: string;
  courseCode: string;
  courseTitle: string;
  creditHours: number | null;
  outcomeCode: string | null;
  outcomeDescription: string;
};

export type CatalogParseSummary = {
  programs: number;
  courses: number;
  outcomes: number;
  duplicateCoursesRemoved: number;
  duplicateOutcomesRemoved: number;
};

export type CatalogParseResult = {
  rows: CatalogRow[];
  summary: CatalogParseSummary;
};

const typoReplacements: Array<[RegExp, string]> = [[/\bBoaeing\b/gi, "Boeing"]];
const titleRows = new Set(["Courses & Outcomes", "Holds all course details & learning outcomes"]);

type ParsedCourse = {
  programName: string;
  courseCode: string;
  courseTitle: string;
  creditHours: number | null;
  courseDescription: string;
  outcomes: Array<{
    outcomeCode: string | null;
    outcomeDescription: string;
  }>;
};

function cleanText(value: unknown) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return typoReplacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), normalized);
}

function parseCredit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  // ProgramCourse.creditHours uses Decimal(4,2): valid range is -99.99..99.99.
  if (Math.abs(parsed) >= 100) {
    return null;
  }

  return parsed;
}

function isProgramHeaderRow(rows: unknown[][], index: number) {
  const row = rows[index] ?? [];
  const nonEmpty = row
    .map((value, columnIndex) => ({ value: cleanText(value), columnIndex }))
    .filter((entry) => entry.value.length > 0);

  if (nonEmpty.length !== 1 || nonEmpty[0]?.columnIndex !== 0) {
    return false;
  }

  const title = nonEmpty[0].value;
  if (titleRows.has(title) || title === "Subitems" || title === "Name") {
    return false;
  }

  const nextRow = rows[index + 1] ?? [];
  return cleanText(nextRow[0]) === "Name" && cleanText(nextRow[1]) === "Courses";
}

function isCourseRow(row: unknown[]) {
  const name = cleanText(row[0]);
  const code = cleanText(row[4]);

  if (!name || !code) {
    return false;
  }

  if (name === "Name" || name === "Subitems") {
    return false;
  }

  return true;
}

function isOutcomeSubitemRow(row: unknown[]) {
  const firstColumn = cleanText(row[0]);
  const outcomeCode = cleanText(row[1]);
  const outcomeDescription = cleanText(row[2]);

  if (firstColumn) {
    return false;
  }

  if (!outcomeCode || !outcomeDescription) {
    return false;
  }

  return /^CLO\d+/i.test(outcomeCode);
}

function finalizeCourse(rows: CatalogRow[], course: ParsedCourse | null) {
  if (!course) {
    return;
  }

  const uniqueOutcomes = new Map<string, { outcomeCode: string | null; outcomeDescription: string }>();
  for (const outcome of course.outcomes) {
    const normalizedDescription = cleanText(outcome.outcomeDescription);
    if (!normalizedDescription) {
      continue;
    }

    if (!uniqueOutcomes.has(normalizedDescription.toLowerCase())) {
      uniqueOutcomes.set(normalizedDescription.toLowerCase(), {
        outcomeCode: outcome.outcomeCode,
        outcomeDescription: normalizedDescription,
      });
    }
  }

  if (uniqueOutcomes.size === 0 && course.courseDescription) {
    uniqueOutcomes.set(course.courseDescription.toLowerCase(), {
      outcomeCode: null,
      outcomeDescription: course.courseDescription,
    });
  }

  if (uniqueOutcomes.size === 0) {
    uniqueOutcomes.set("__placeholder__", {
      outcomeCode: null,
      outcomeDescription: "Outcome not specified in source workbook.",
    });
  }

  for (const outcome of uniqueOutcomes.values()) {
    rows.push({
      programName: course.programName,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      creditHours: course.creditHours,
      outcomeCode: outcome.outcomeCode,
      outcomeDescription: outcome.outcomeDescription,
    });
  }
}

function parseMondaySheetRows(rows: unknown[][]) {
  const rawCatalogRows: CatalogRow[] = [];
  let currentProgramName = "";
  let currentCourse: ParsedCourse | null = null;
  const seenCourseKeys = new Set<string>();
  let duplicateCoursesDetected = 0;

  const finalizeCurrentCourse = () => {
    if (!currentCourse) {
      return;
    }

    const courseKey = `${currentCourse.programName.toLowerCase()}|${currentCourse.courseCode.toLowerCase()}|${currentCourse.courseTitle.toLowerCase()}`;
    if (seenCourseKeys.has(courseKey)) {
      duplicateCoursesDetected += 1;
    } else {
      seenCourseKeys.add(courseKey);
    }

    finalizeCourse(rawCatalogRows, currentCourse);
  };

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (isProgramHeaderRow(rows, rowIndex)) {
      finalizeCurrentCourse();
      currentCourse = null;
      currentProgramName = cleanText(rows[rowIndex]?.[0]) || "Uncategorized Program";
      continue;
    }

    const row = rows[rowIndex] ?? [];
    if (isCourseRow(row)) {
      finalizeCurrentCourse();
      currentCourse = {
        programName: currentProgramName || "Uncategorized Program",
        courseCode: cleanText(row[4]),
        courseTitle: cleanText(row[0]),
        creditHours: parseCredit(row[3]),
        courseDescription: cleanText(row[2]),
        outcomes: [],
      };
      continue;
    }

    if (currentCourse && isOutcomeSubitemRow(row)) {
      currentCourse.outcomes.push({
        outcomeCode: cleanText(row[1]) || null,
        outcomeDescription: cleanText(row[2]),
      });
    }
  }

  finalizeCurrentCourse();
  return {
    rows: rawCatalogRows,
    duplicateCoursesDetected,
  };
}

export function parseCatalogWorkbook(buffer: Buffer): CatalogParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rawRows: CatalogRow[] = [];
  let duplicateCoursesRemoved = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const gridRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    if (gridRows.length === 0) {
      continue;
    }

    const parsedRows = parseMondaySheetRows(gridRows);
    if (parsedRows.rows.length > 0) {
      rawRows.push(...parsedRows.rows);
      duplicateCoursesRemoved += parsedRows.duplicateCoursesDetected;
      continue;
    }

    // Fallback for non-Monday sheets: treat sheet name as program and parse common columns.
    const headerRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    for (const fallbackRow of headerRows) {
      const keys = Object.keys(fallbackRow);
      const keyFor = (candidates: string[]) =>
        keys.find((key) => candidates.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase())));

      const courseCode = cleanText(fallbackRow[keyFor(["course code", "code", "course"]) ?? ""]);
      const courseTitle = cleanText(fallbackRow[keyFor(["course title", "title", "course name"]) ?? ""]);
      const creditHours = parseCredit(fallbackRow[keyFor(["credit", "hours"]) ?? ""]);
      const outcomeDescription = cleanText(
        fallbackRow[keyFor(["outcome description", "learning outcome", "description", "outcome"]) ?? ""],
      );
      const outcomeCode = cleanText(fallbackRow[keyFor(["outcome code", "outcome #"]) ?? ""]) || null;

      if (!courseCode || !courseTitle || !outcomeDescription) {
        continue;
      }

      rawRows.push({
        programName: cleanText(sheetName) || "Default Program",
        courseCode,
        courseTitle,
        creditHours,
        outcomeCode,
        outcomeDescription,
      });
    }
  }

  const courseMap = new Map<string, { outcomes: Map<string, CatalogRow> }>();
  let duplicateOutcomesRemoved = 0;

  for (const row of rawRows) {
    const programName = cleanText(row.programName);
    const courseCode = cleanText(row.courseCode);
    const courseTitle = cleanText(row.courseTitle);
    const outcomeDescription = cleanText(row.outcomeDescription);
    const outcomeCode = cleanText(row.outcomeCode) || null;

    if (!programName || !courseCode || !courseTitle || !outcomeDescription) {
      continue;
    }

    const courseKey = `${programName.toLowerCase()}|${courseCode.toLowerCase()}|${courseTitle.toLowerCase()}`;
    const outcomeKey = outcomeDescription.toLowerCase();

    if (!courseMap.has(courseKey)) {
      courseMap.set(courseKey, {
        outcomes: new Map<string, CatalogRow>(),
      });
    }

    const courseRecord = courseMap.get(courseKey)!;
    if (!courseRecord.outcomes.has(outcomeKey)) {
      courseRecord.outcomes.set(outcomeKey, {
        programName,
        courseCode,
        courseTitle,
        creditHours: row.creditHours,
        outcomeCode,
        outcomeDescription,
      });
    } else {
      duplicateOutcomesRemoved += 1;
    }
  }

  const rows: CatalogRow[] = [];
  for (const courseRecord of courseMap.values()) {
    rows.push(...courseRecord.outcomes.values());
  }

  const programs = new Set(rows.map((row) => row.programName));
  const courseCount = courseMap.size;
  const outcomes = rows.length;

  return {
    rows,
    summary: {
      programs: programs.size,
      courses: courseCount,
      outcomes,
      duplicateCoursesRemoved,
      duplicateOutcomesRemoved,
    },
  };
}
