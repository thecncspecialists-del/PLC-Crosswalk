import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseCatalogWorkbook } from "@/lib/catalog-parser";

function buildWorkbookBuffer() {
  const workbook = XLSX.utils.book_new();
  const rows: unknown[][] = [
    ["Courses & Outcomes"],
    ["Holds all course details & learning outcomes"],
    [""],
    ["BASC – Basic Academic Skills"],
    [
      "Name",
      "Courses",
      "(*AI) Description",
      "Hrs",
      "Code",
      "Yr",
      "Qtr",
      "Course Shell",
      "Syllabus",
      "Physical Inventory",
      "Curriculum",
      "Certs",
      "Amatrol",
      "Tooling-U",
      "Electude",
      "Development Status",
      "Timeline - Start",
      "Timeline - End",
      "Enrollment Tracker",
    ],
    ["Digital Literacy", "", "Foundational digital skills for apprentices.", 26, "BASC 001"],
    ["IMTA - Industrial Maintenance"],
    [
      "Name",
      "Courses",
      "(*AI) Description",
      "Hrs",
      "Code",
      "Yr",
      "Qtr",
      "Course Shell",
      "Syllabus",
      "Physical Inventory",
      "Curriculum",
      "Certs",
      "Amatrol",
      "Tooling-U",
      "Electude",
      "Development Status",
      "Timeline - Start",
      "Timeline - End",
      "Enrollment Tracker",
    ],
    ["Communication & Documentation", "", "Communication class.", 3, "IMTA 211"],
    ["Subitems", "Name", "Description"],
    ["", "CLO1", "Draft basic maintenance communications."],
    ["", "CLO2", "Interpret and document maintenance tasks."],
    ["Communication & Documentation", "", "Communication class.", 3, "IMTA 211"],
    ["Subitems", "Name", "Description"],
    ["", "CLO1", "Draft basic maintenance communications."],
    ["", "CLO2", "Interpret and document maintenance tasks."],
    ["BRAP - Boaeing Registered Apprenticeship"],
    [
      "Name",
      "Courses",
      "(*AI) Description",
      "Hrs",
      "Code",
      "Yr",
      "Qtr",
      "Course Shell",
      "Syllabus",
      "Physical Inventory",
      "Curriculum",
      "Certs",
      "Amatrol",
      "Tooling-U",
      "Electude",
      "Development Status",
      "Timeline - Start",
      "Timeline - End",
      "Enrollment Tracker",
    ],
    ["Boeing RAP - CNC Programming", "", "Advanced CNC intro.", 4, "BRAP 999"],
    ["Subitems", "Name", "Description"],
    ["", "CLO1", "Program a basic CNC part."],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "courses & outcomes");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

describe("parseCatalogWorkbook", () => {
  it("extracts Monday programs/courses/outcomes and removes duplicate IMTA 211 entries", () => {
    const parsed = parseCatalogWorkbook(buildWorkbookBuffer());

    expect(parsed.summary.programs).toBe(3);
    expect(parsed.summary.courses).toBe(3);
    expect(parsed.summary.outcomes).toBe(4);
    expect(parsed.summary.duplicateCoursesRemoved).toBe(1);
    expect(parsed.summary.duplicateOutcomesRemoved).toBe(2);

    const imtaRows = parsed.rows.filter((row) => row.programName === "IMTA - Industrial Maintenance");
    expect(imtaRows).toHaveLength(2);
    expect(imtaRows.every((row) => row.courseCode === "IMTA 211")).toBe(true);
  });

  it("uses fallback course description when no CLO subitems are available", () => {
    const parsed = parseCatalogWorkbook(buildWorkbookBuffer());
    const bascRows = parsed.rows.filter((row) => row.courseCode === "BASC 001");

    expect(bascRows).toHaveLength(1);
    expect(bascRows[0]?.outcomeDescription).toBe("Foundational digital skills for apprentices.");
    expect(bascRows[0]?.outcomeCode).toBeNull();
  });

  it("applies explicit typo normalization for program names", () => {
    const parsed = parseCatalogWorkbook(buildWorkbookBuffer());
    const brapProgramNames = [...new Set(parsed.rows.filter((row) => row.courseCode === "BRAP 999").map((row) => row.programName))];

    expect(brapProgramNames).toEqual(["BRAP - Boeing Registered Apprenticeship"]);
  });
});
