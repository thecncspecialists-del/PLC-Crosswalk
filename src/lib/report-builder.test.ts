import { CourseDecisionStatus, MappingPlanStatus, ReportFormat } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildReportViewModel,
  renderReportPdfBuffer,
  type TranscriptForReport,
} from "@/lib/report-builder";

function transcriptFixture(): TranscriptForReport {
  return {
    id: "transcript-1",
    uploadedAt: new Date("2026-05-01T12:00:00Z"),
    student: {
      firstName: "Connor",
      lastName: "Cuomo",
      studentRef: "6271902b",
    },
    institution: {
      name: "Orange Coast College",
    },
    mappingPlan: {
      status: MappingPlanStatus.APPROVED,
      approvedAt: new Date("2026-05-02T12:00:00Z"),
      selectedProgram: {
        name: "MACH - Machinist",
        courses: [
          {
            id: "pc-1",
            code: "MACH 100",
            title: "Safety",
            creditHours: 20,
            outcomes: [{ description: "Apply shop safety procedures." }],
          },
          {
            id: "pc-2",
            code: "MACH 110",
            title: "Blueprints",
            creditHours: 10,
            outcomes: [{ description: "Interpret basic blueprint symbols." }],
          },
          {
            id: "pc-3",
            code: "MACH 120",
            title: "Journey Course",
            creditHours: 30,
            outcomes: [],
          },
        ],
      },
      journeyCourses: [
        {
          programCourseId: "pc-3",
          programCourse: {
            id: "pc-3",
            code: "MACH 120",
            title: "Journey Course",
            creditHours: 30,
            outcomes: [],
          },
        },
      ],
      decisions: [
        {
          status: CourseDecisionStatus.MAPPED,
          awardedCredits: null,
          rationale: "Transcript course satisfies two catalog requirements.",
          reviewedAt: new Date("2026-05-03T12:00:00Z"),
          reviewedBy: { name: "Admin Reviewer", email: "admin@example.com" },
          externalCourse: {
            courseCode: "TEST 101",
            title: "Intro to Testing",
            credits: 3,
            grade: "A",
          },
          selections: [
            {
              programCourseId: "pc-1",
              awardedCredits: 20,
              programCourse: {
                id: "pc-1",
                code: "MACH 100",
                title: "Safety",
                creditHours: 20,
                outcomes: [{ description: "Apply shop safety procedures." }],
              },
            },
            {
              programCourseId: "pc-2",
              awardedCredits: 10,
              programCourse: {
                id: "pc-2",
                code: "MACH 110",
                title: "Blueprints",
                creditHours: 10,
                outcomes: [{ description: "Interpret basic blueprint symbols." }],
              },
            },
          ],
          evidence: [
            {
              kind: "TRANSCRIPT_TEXT",
              snippet:
                "TEST 101 Intro to Testing shows a completed course with transcript details and enough long evidence text to demonstrate student/admin truncation behavior.",
            },
          ],
        },
        {
          status: CourseDecisionStatus.CREDIT_ONLY,
          awardedCredits: 5,
          rationale: "Credit is awarded outside the catalog map.",
          reviewedAt: null,
          reviewedBy: null,
          externalCourse: {
            courseCode: "PLC 200",
            title: "Prior Learning",
            credits: 1,
            grade: "S",
          },
          selections: [],
          evidence: [],
        },
        {
          status: CourseDecisionStatus.NO_CREDIT,
          awardedCredits: null,
          rationale: "Course does not satisfy program requirements.",
          reviewedAt: null,
          reviewedBy: null,
          externalCourse: {
            courseCode: "ART 101",
            title: "Studio Art",
            credits: 3,
            grade: "B",
          },
          selections: [],
          evidence: [],
        },
        {
          status: CourseDecisionStatus.UNREVIEWED,
          awardedCredits: null,
          rationale: null,
          reviewedAt: null,
          reviewedBy: null,
          externalCourse: {
            courseCode: "PEND 101",
            title: "Pending Review",
            credits: 2,
            grade: null,
          },
          selections: [],
          evidence: [],
        },
      ],
    },
  };
}

describe("buildReportViewModel", () => {
  it("maps decision statuses to official report statuses", () => {
    const model = buildReportViewModel(transcriptFixture(), ReportFormat.STUDENT, new Date("2026-05-04T12:00:00Z"));

    expect(model.rows.map((row) => row.status)).toEqual([
      "Awarded",
      "Awarded",
      "Awarded",
      "Not Awarded",
      "Pending Review",
    ]);
    expect(model.summary).toMatchObject({
      awardedRows: 3,
      notAwardedRows: 1,
      pendingRows: 1,
      awardedHours: 35,
      completedProgramHours: 60,
      remainingProgramHours: 0,
    });
  });

  it("creates one awarded row per selected catalog course", () => {
    const model = buildReportViewModel(transcriptFixture(), ReportFormat.STUDENT);
    const mappedRows = model.rows.filter((row) => row.catalogCourse.startsWith("MACH"));

    expect(mappedRows.map((row) => row.catalogCourse)).toEqual(["MACH 100", "MACH 110"]);
    expect(mappedRows.map((row) => row.transferRequirement)).toEqual([
      "Apply shop safety procedures.",
      "Interpret basic blueprint symbols.",
    ]);
  });

  it("expands administrative detail while keeping student evidence shorter", () => {
    const studentModel = buildReportViewModel(transcriptFixture(), ReportFormat.STUDENT);
    const adminModel = buildReportViewModel(transcriptFixture(), ReportFormat.ADMIN);

    expect(adminModel.rows[0]?.evidence.length).toBeGreaterThan(studentModel.rows[0]?.evidence.length ?? 0);
    expect(adminModel.rows[0]?.adminDetail).toMatchObject({
      rationale: "Transcript course satisfies two catalog requirements.",
      reviewer: "Admin Reviewer",
    });
  });
});

describe("renderReportPdfBuffer", () => {
  it("renders a PDF buffer", async () => {
    const model = buildReportViewModel(transcriptFixture(), ReportFormat.ADMIN);
    const pdfBuffer = await renderReportPdfBuffer(model);

    expect(pdfBuffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
