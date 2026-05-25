import type { ReportFormat } from "@prisma/client";

type ReportDownloadInput = {
  id: string;
  format: ReportFormat;
  fileUrl: string;
  generatedAt?: Date | string | null;
  transcript?: {
    student?: {
      firstName: string;
      lastName: string;
    } | null;
  } | null;
};

const REPORT_FILE_DATE_TIME_ZONE = "America/Los_Angeles";

function isPdfBuffer(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function isPdfReference(fileUrl: string) {
  const normalized = fileUrl.toLowerCase();
  return normalized.startsWith("data:application/pdf") || normalized.includes(".pdf");
}

function safeFileNamePart(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "Report"
  );
}

export function formatReportFileDate(value: Date | string | null | undefined) {
  const date = value == null ? new Date() : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: REPORT_FILE_DATE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(safeDate);
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  return `${month}${day}${year}`;
}

export function buildReportDownloadFileName(report: ReportDownloadInput, extension: "pdf" | "txt") {
  const student = report.transcript?.student;
  const studentName = safeFileNamePart(
    [student?.firstName, student?.lastName].filter((part): part is string => Boolean(part?.trim())).join(" "),
  );
  const reportType = report.format === "ADMIN" ? "Admin_Report" : "Student_Report";
  return `${studentName}_${reportType}_${formatReportFileDate(report.generatedAt)}.${extension}`;
}

export function getReportDownloadMetadata(report: ReportDownloadInput, fileBuffer: Buffer) {
  const isPdf = isPdfBuffer(fileBuffer) || isPdfReference(report.fileUrl);
  const extension = isPdf ? "pdf" : "txt";
  return {
    contentType: isPdf ? "application/pdf" : "text/plain; charset=utf-8",
    fileName: buildReportDownloadFileName(report, extension),
  };
}
