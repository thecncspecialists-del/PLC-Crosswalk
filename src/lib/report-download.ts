import type { ReportFormat } from "@prisma/client";

type ReportDownloadInput = {
  id: string;
  format: ReportFormat;
  fileUrl: string;
};

function isPdfBuffer(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function isPdfReference(fileUrl: string) {
  const normalized = fileUrl.toLowerCase();
  return normalized.startsWith("data:application/pdf") || normalized.includes(".pdf");
}

export function getReportDownloadMetadata(report: ReportDownloadInput, fileBuffer: Buffer) {
  const isPdf = isPdfBuffer(fileBuffer) || isPdfReference(report.fileUrl);
  const extension = isPdf ? "pdf" : "txt";
  return {
    contentType: isPdf ? "application/pdf" : "text/plain; charset=utf-8",
    fileName: `${report.format.toLowerCase()}-${report.id}.${extension}`,
  };
}
