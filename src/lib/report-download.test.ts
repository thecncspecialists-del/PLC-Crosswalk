import { ReportFormat } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { formatReportFileDate, getReportDownloadMetadata } from "@/lib/report-download";

describe("getReportDownloadMetadata", () => {
  it("serves generated PDFs with PDF headers and filenames", () => {
    const metadata = getReportDownloadMetadata(
      {
        id: "report-1",
        format: ReportFormat.ADMIN,
        fileUrl: "reports/report-1.pdf",
        generatedAt: new Date("2026-05-25T15:00:00Z"),
        transcript: {
          student: {
            firstName: "Windy",
            lastName: "Schatz",
          },
        },
      },
      Buffer.from("%PDF-1.7\n"),
    );

    expect(metadata).toEqual({
      contentType: "application/pdf",
      fileName: "Windy_Schatz_Admin_Report_05252026.pdf",
    });
  });

  it("keeps legacy text reports downloadable as text", () => {
    const metadata = getReportDownloadMetadata(
      {
        id: "report-2",
        format: ReportFormat.STUDENT,
        fileUrl: "reports/report-2.txt",
        generatedAt: new Date("2026-05-25T15:00:00Z"),
        transcript: {
          student: {
            firstName: "Connor",
            lastName: "Cuomo",
          },
        },
      },
      Buffer.from("The Machinists Institute - PLC Award Summary"),
    );

    expect(metadata).toEqual({
      contentType: "text/plain; charset=utf-8",
      fileName: "Connor_Cuomo_Student_Report_05252026.txt",
    });
  });

  it("formats report dates as an eight-digit month-day-year value", () => {
    expect(formatReportFileDate(new Date("2026-05-25T15:00:00Z"))).toBe("05252026");
  });
});
