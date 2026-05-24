import { CourseDecisionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  choosePdfCandidate,
  deriveDecisionFromMap,
  parseDemgyWorkbook,
  type DemgyStudentImportConfig,
} from "@/lib/workbook-transcript-import";

function buildWorkbookBuffer() {
  const workbook = XLSX.utils.book_new();

  const mapRows: unknown[][] = [
    [
      "Bates Prior Learning Course",
      "Course Hours",
      "MI Equivelant Course",
      "Course Hours",
      "Shawna Lewis",
    ],
    ["MACH 112 - Industrial Safety I", 50, "MACH 100 - Safety for Machinists", 10, "4"],
    ["MACH 168 - Surface Grinding", 50, "No equivalent", "-", "3.0"],
    ["MACH 117 - Measuring Application", 50, "MACH 204 - Metrology 1", 10, "Dropped"],
    ["MACH 150 - Measurement Mat & Safety", 50, "MACH 108 - Metrology Fundamentals", 10, "Pending"],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(mapRows), "Map");

  const studentRows: unknown[][] = [
    ["Shawna Lewis", "Bates Technical College"],
    ["Code - Course", "Credit", "GPA"],
    ["MACH 112 - Industrial Safety I", 3, "4"],
    ["MACH 117 - Measuring Application (Repeated)", 0, "2.8"],
    ["MACH 168 - Surface Grinding", 3, "3.0"],
    ["MACH 150 - Measurement Mat & Safety", 5, "3.3"],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(studentRows), "Shawna Lewis");

  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

describe("parseDemgyWorkbook", () => {
  it("extracts map rows and student course rows from workbook structure", () => {
    const config: DemgyStudentImportConfig[] = [
      {
        key: "shawna-lewis",
        sheetName: "Shawna Lewis",
        mapColumnName: "Shawna Lewis",
        firstName: "Shawna",
        lastName: "Lewis",
        pdfCandidates: ["S. Lewis Unofficial Transcript.pdf"],
      },
    ];

    const parsed = parseDemgyWorkbook(buildWorkbookBuffer(), config);
    expect(parsed.students).toHaveLength(1);
    expect(parsed.students[0]?.institutionName).toBe("Bates Technical College");
    expect(parsed.students[0]?.courses).toHaveLength(4);
    expect(parsed.students[0]?.courses[0]?.courseCode).toBe("MACH 112");
    expect(parsed.students[0]?.courses[1]?.isRepeated).toBe(true);
    expect(parsed.mapRows).toHaveLength(4);
    expect(parsed.mapRows[0]?.miEquivalentCode).toBe("MACH 100");
  });
});

describe("deriveDecisionFromMap", () => {
  const mapRow = {
    sourceLabel: "MACH 112 - Industrial Safety I",
    sourceCourseCode: "MACH 112",
    miEquivalent: "MACH 100 - Safety for Machinists",
    miEquivalentCode: "MACH 100",
    studentValues: {},
  };

  it("returns mapped for numeric map value", () => {
    const decision = deriveDecisionFromMap({
      course: {
        sourceLabel: "MACH 112 - Industrial Safety I",
        courseCode: "MACH 112",
        title: "Industrial Safety I",
        credits: 3,
        grade: "4.0",
        isRepeated: false,
      },
      mapRow,
      mapValue: "4",
    });
    expect(decision.status).toBe(CourseDecisionStatus.MAPPED);
    expect(decision.mappedProgramCourseCode).toBe("MACH 100");
  });

  it("returns no-credit for dropped and no equivalent", () => {
    const dropped = deriveDecisionFromMap({
      course: {
        sourceLabel: "MACH 117 - Measuring Application",
        courseCode: "MACH 117",
        title: "Measuring Application",
        credits: 5,
        grade: "3.5",
        isRepeated: false,
      },
      mapRow,
      mapValue: "Dropped",
    });
    expect(dropped.status).toBe(CourseDecisionStatus.NO_CREDIT);

    const noEquivalent = deriveDecisionFromMap({
      course: {
        sourceLabel: "MACH 168 - Surface Grinding",
        courseCode: "MACH 168",
        title: "Surface Grinding",
        credits: 3,
        grade: "3.0",
        isRepeated: false,
      },
      mapRow: {
        ...mapRow,
        miEquivalent: "No equivalent",
        miEquivalentCode: null,
      },
      mapValue: "3.0",
    });
    expect(noEquivalent.status).toBe(CourseDecisionStatus.NO_CREDIT);
  });

  it("returns no-credit for repeated rows and unreviewed for pending", () => {
    const repeated = deriveDecisionFromMap({
      course: {
        sourceLabel: "MACH 117 - Measuring Application (Repeated)",
        courseCode: "MACH 117",
        title: "Measuring Application (Repeated)",
        credits: 0,
        grade: "2.8",
        isRepeated: true,
      },
      mapRow,
      mapValue: "4",
    });
    expect(repeated.status).toBe(CourseDecisionStatus.NO_CREDIT);

    const pending = deriveDecisionFromMap({
      course: {
        sourceLabel: "MACH 150 - Measurement Mat & Safety",
        courseCode: "MACH 150",
        title: "Measurement Mat & Safety",
        credits: 5,
        grade: "3.3",
        isRepeated: false,
      },
      mapRow,
      mapValue: "Pending",
    });
    expect(pending.status).toBe(CourseDecisionStatus.UNREVIEWED);
  });
});

describe("choosePdfCandidate", () => {
  it("selects first candidate and reports duplicate hashes", () => {
    const chosen = choosePdfCandidate([
      { fileName: "A.pdf", hash: "hash-1" },
      { fileName: "B.pdf", hash: "hash-1" },
    ]);

    expect(chosen.selected).toBe("A.pdf");
    expect(chosen.duplicateHashes).toEqual(["hash-1"]);
  });
});
