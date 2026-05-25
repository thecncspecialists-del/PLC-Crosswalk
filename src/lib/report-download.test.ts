import { ReportFormat } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getReportDownloadMetadata } from "@/lib/report-download";

describe("getReportDownloadMetadata", () => {
  it("serves generated PDFs with PDF headers and filenames", () => {
    const metadata = getReportDownloadMetadata(
      {
        id: "report-1",
        format: ReportFormat.ADMIN,
        fileUrl: "reports/report-1.pdf",
      },
      Buffer.from("%PDF-1.7\n"),
    );

    expect(metadata).toEqual({
      contentType: "application/pdf",
      fileName: "admin-report-1.pdf",
    });
  });

  it("keeps legacy text reports downloadable as text", () => {
    const metadata = getReportDownloadMetadata(
      {
        id: "report-2",
        format: ReportFormat.STUDENT,
        fileUrl: "reports/report-2.txt",
      },
      Buffer.from("The Machinists Institute - PLC Award Summary"),
    );

    expect(metadata).toEqual({
      contentType: "text/plain; charset=utf-8",
      fileName: "student-report-2.txt",
    });
  });
});
