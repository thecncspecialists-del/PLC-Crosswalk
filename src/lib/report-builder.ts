import { CourseDecisionStatus, MappingPlanStatus, ReportFormat } from "@prisma/client";
import PDFDocument from "pdfkit";

import { formatMiCredits, formatMiHours, hoursToMiCredits } from "@/lib/mi-hours";

type NumericValue = number | string | { toString: () => string } | null;

type ProgramCourseForReport = {
  id?: string;
  code: string;
  title: string;
  creditHours: NumericValue;
  outcomes?: Array<{
    description: string;
  }>;
};

type CourseDecisionForReport = {
  status: CourseDecisionStatus;
  awardedCredits: NumericValue;
  rationale: string | null;
  reviewedAt: Date | null;
  reviewedBy?: {
    name: string | null;
    email: string;
  } | null;
  externalCourse: {
    courseCode: string | null;
    title: string;
    credits: NumericValue;
    grade: string | null;
  };
  selections: Array<{
    awardedCredits: NumericValue;
    programCourseId?: string;
    programCourse: ProgramCourseForReport;
  }>;
  evidence: Array<{
    kind: string;
    snippet: string;
  }>;
};

export type TranscriptForReport = {
  id: string;
  uploadedAt: Date;
  student: {
    firstName: string;
    lastName: string;
    studentRef: string | null;
  };
  institution: {
    name: string;
  };
  mappingPlan: {
    status: MappingPlanStatus;
    approvedAt: Date | null;
    selectedProgram: {
      name: string;
      courses?: ProgramCourseForReport[];
    } | null;
    journeyCourses?: Array<{
      programCourseId: string;
      programCourse: ProgramCourseForReport;
    }>;
    decisions: CourseDecisionForReport[];
  } | null;
};

export type ReportStatusLabel = "Awarded" | "Not Awarded" | "Pending Review";

export type ReportTableRow = {
  id: string;
  catalogCourse: string;
  courseTitle: string;
  units: string;
  transferRequirement: string;
  evidence: string;
  status: ReportStatusLabel;
  awardedHours: number | null;
  programCourseId: string | null;
  adminDetail: {
    transcriptCourse: string;
    rationale: string;
    reviewer: string;
    reviewedAt: string;
  };
};

export type ReportViewModel = {
  format: ReportFormat;
  title: string;
  generatedAt: Date;
  studentName: string;
  studentRef: string;
  institutionName: string;
  transcriptId: string;
  uploadedAt: Date;
  programName: string;
  planStatus: string;
  approvedAt: string;
  summary: {
    awardedRows: number;
    notAwardedRows: number;
    pendingRows: number;
    awardedHours: number;
    awardedCredits: number;
    completedProgramHours: number | null;
    completedProgramCredits: number | null;
    remainingProgramHours: number | null;
    remainingProgramCredits: number | null;
  };
  rows: ReportTableRow[];
};

type TableColumn = {
  key: keyof Pick<
    ReportTableRow,
    "catalogCourse" | "courseTitle" | "units" | "transferRequirement" | "evidence" | "status"
  >;
  label: string;
  width: number;
};

type DetailColumn = {
  key: keyof ReportTableRow["adminDetail"];
  label: string;
  width: number;
};

const PAGE_MARGIN = 36;
const PAGE_BOTTOM_MARGIN = 42;
const STUDENT_EVIDENCE_LIMIT = 170;
const ADMIN_EVIDENCE_LIMIT = 420;
const MAIN_TABLE_COLUMNS: TableColumn[] = [
  { key: "catalogCourse", label: "Catalog Course", width: 70 },
  { key: "courseTitle", label: "Course Title", width: 125 },
  { key: "units", label: "Units / Hours", width: 70 },
  { key: "transferRequirement", label: "Requirements for Transfer", width: 150 },
  { key: "evidence", label: "Satisfied By / Evidence", width: 210 },
  { key: "status", label: "Status", width: 95 },
];
const ADMIN_DETAIL_COLUMNS: DetailColumn[] = [
  { key: "transcriptCourse", label: "Transcript Course", width: 160 },
  { key: "rationale", label: "Administrative Rationale", width: 330 },
  { key: "reviewer", label: "Reviewer", width: 120 },
  { key: "reviewedAt", label: "Reviewed", width: 110 },
];

function toNumber(value: NumericValue) {
  if (value == null) {
    return null;
  }
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function compact(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "N/A";
  }
  return value.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatHoursAndCredits(value: NumericValue) {
  const hours = toNumber(value);
  return `${formatMiHours(hours)} / ${formatMiCredits(hoursToMiCredits(hours))}`;
}

function formatTranscriptCredits(value: NumericValue) {
  const credits = toNumber(value);
  if (credits == null) {
    return "N/A";
  }
  return `${credits.toLocaleString("en-US", { maximumFractionDigits: 2 })} credits`;
}

function externalCourseLabel(decision: CourseDecisionForReport) {
  return compact([decision.externalCourse.courseCode ?? "N/A", decision.externalCourse.title]);
}

function evidenceText(decision: CourseDecisionForReport, maxLength: number) {
  const transcriptParts = [
    externalCourseLabel(decision),
    decision.externalCourse.grade ? `grade ${decision.externalCourse.grade}` : null,
    decision.externalCourse.credits == null ? null : formatTranscriptCredits(decision.externalCourse.credits),
  ];
  const evidence = decision.evidence
    .map((entry) => `${entry.kind}: ${entry.snippet}`)
    .filter((entry) => entry.trim().length > 0)
    .join(" | ");
  return truncateText(compact([`Transcript: ${compact(transcriptParts)}.`, evidence || null]), maxLength);
}

function statusLabel(status: CourseDecisionStatus): ReportStatusLabel {
  if (status === CourseDecisionStatus.MAPPED || status === CourseDecisionStatus.CREDIT_ONLY) {
    return "Awarded";
  }
  if (status === CourseDecisionStatus.NO_CREDIT) {
    return "Not Awarded";
  }
  return "Pending Review";
}

function courseRequirement(course: ProgramCourseForReport | null, fallback: string) {
  const outcomes = course?.outcomes?.map((outcome) => outcome.description).filter(Boolean) ?? [];
  return truncateText(outcomes.join(" ") || fallback, 260);
}

function adminDetail(decision: CourseDecisionForReport) {
  return {
    transcriptCourse: externalCourseLabel(decision),
    rationale: decision.rationale?.trim() || "N/A",
    reviewer: decision.reviewedBy?.name?.trim() || decision.reviewedBy?.email || "N/A",
    reviewedAt: formatDateTime(decision.reviewedAt),
  };
}

function buildRowsForDecision(
  decision: CourseDecisionForReport,
  format: ReportFormat,
  index: number,
): ReportTableRow[] {
  const evidenceLimit = format === ReportFormat.ADMIN ? ADMIN_EVIDENCE_LIMIT : STUDENT_EVIDENCE_LIMIT;
  const baseEvidence = evidenceText(decision, evidenceLimit);
  const detail = adminDetail(decision);
  const status = statusLabel(decision.status);

  if (decision.status === CourseDecisionStatus.MAPPED) {
    if (decision.selections.length === 0) {
      return [
        {
          id: `${index}:mapped-without-selection`,
          catalogCourse: "N/A",
          courseTitle: "Mapped PLC Credit",
          units: formatHoursAndCredits(decision.awardedCredits),
          transferRequirement: "Mapped credit was awarded without a selected catalog course.",
          evidence: baseEvidence,
          status,
          awardedHours: toNumber(decision.awardedCredits),
          programCourseId: null,
          adminDetail: detail,
        },
      ];
    }

    return decision.selections.map((selection, selectionIndex) => ({
      id: `${index}:mapped:${selection.programCourse.code}:${selectionIndex}`,
      catalogCourse: selection.programCourse.code,
      courseTitle: selection.programCourse.title,
      units: formatHoursAndCredits(selection.awardedCredits ?? selection.programCourse.creditHours),
      transferRequirement: courseRequirement(selection.programCourse, "Catalog course requirement satisfied."),
      evidence: baseEvidence,
      status,
      awardedHours: toNumber(selection.awardedCredits ?? selection.programCourse.creditHours),
      programCourseId: selection.programCourseId ?? selection.programCourse.id ?? null,
      adminDetail: detail,
    }));
  }

  if (decision.status === CourseDecisionStatus.CREDIT_ONLY) {
    return [
      {
        id: `${index}:credit-only`,
        catalogCourse: "PLC CREDIT",
        courseTitle: "Unmapped PLC Credit",
        units: formatHoursAndCredits(decision.awardedCredits),
        transferRequirement: "PLC credit awarded without a catalog course mapping.",
        evidence: baseEvidence,
        status,
        awardedHours: toNumber(decision.awardedCredits),
        programCourseId: null,
        adminDetail: detail,
      },
    ];
  }

  return [
    {
      id: `${index}:${decision.status.toLowerCase()}`,
      catalogCourse: decision.externalCourse.courseCode ?? "N/A",
      courseTitle: decision.externalCourse.title,
      units: formatTranscriptCredits(decision.externalCourse.credits),
      transferRequirement:
        decision.status === CourseDecisionStatus.NO_CREDIT
          ? "No catalog requirement was satisfied by this transcript course."
          : "Pending catalog requirement review.",
      evidence: baseEvidence,
      status,
      awardedHours: null,
      programCourseId: null,
      adminDetail: detail,
    },
  ];
}

function buildProgramSummary(transcript: TranscriptForReport, rows: ReportTableRow[]) {
  const programCourses = transcript.mappingPlan?.selectedProgram?.courses ?? [];
  if (programCourses.length === 0) {
    return {
      completedProgramHours: null,
      completedProgramCredits: null,
      remainingProgramHours: null,
      remainingProgramCredits: null,
    };
  }

  const courseHoursById = new Map(
    programCourses
      .filter((course) => course.id)
      .map((course) => [course.id!, toNumber(course.creditHours) ?? 0]),
  );
  const completedCourseIds = new Set<string>();
  for (const row of rows) {
    if (row.status === "Awarded" && row.programCourseId) {
      completedCourseIds.add(row.programCourseId);
    }
  }
  for (const journeyCourse of transcript.mappingPlan?.journeyCourses ?? []) {
    completedCourseIds.add(journeyCourse.programCourseId);
    if (!courseHoursById.has(journeyCourse.programCourseId)) {
      courseHoursById.set(journeyCourse.programCourseId, toNumber(journeyCourse.programCourse.creditHours) ?? 0);
    }
  }

  const programHoursTotal = [...courseHoursById.values()].reduce((sum, value) => sum + value, 0);
  const completedProgramHours = [...completedCourseIds].reduce(
    (sum, courseId) => sum + (courseHoursById.get(courseId) ?? 0),
    0,
  );
  const remainingProgramHours = Math.max(programHoursTotal - completedProgramHours, 0);

  return {
    completedProgramHours,
    completedProgramCredits: hoursToMiCredits(completedProgramHours) ?? 0,
    remainingProgramHours,
    remainingProgramCredits: hoursToMiCredits(remainingProgramHours) ?? 0,
  };
}

export function buildReportViewModel(
  transcript: TranscriptForReport,
  format: ReportFormat,
  generatedAt = new Date(),
): ReportViewModel {
  const decisions = transcript.mappingPlan?.decisions ?? [];
  const rows = decisions.flatMap((decision, index) => buildRowsForDecision(decision, format, index));
  const awardedHours = rows.reduce((sum, row) => sum + (row.awardedHours ?? 0), 0);
  const programSummary = buildProgramSummary(transcript, rows);

  return {
    format,
    title: format === ReportFormat.ADMIN ? "PLC Administrative Credit Evaluation" : "PLC Student Credit Summary",
    generatedAt,
    studentName: `${transcript.student.firstName} ${transcript.student.lastName}`,
    studentRef: transcript.student.studentRef ?? "N/A",
    institutionName: transcript.institution.name,
    transcriptId: transcript.id,
    uploadedAt: transcript.uploadedAt,
    programName: transcript.mappingPlan?.selectedProgram?.name ?? "Not selected",
    planStatus: transcript.mappingPlan?.status ?? "DRAFT",
    approvedAt: formatDateTime(transcript.mappingPlan?.approvedAt ?? null),
    summary: {
      awardedRows: rows.filter((row) => row.status === "Awarded").length,
      notAwardedRows: rows.filter((row) => row.status === "Not Awarded").length,
      pendingRows: rows.filter((row) => row.status === "Pending Review").length,
      awardedHours,
      awardedCredits: hoursToMiCredits(awardedHours) ?? 0,
      ...programSummary,
    },
    rows,
  };
}

function pageBottom(doc: PDFKit.PDFDocument) {
  return doc.page.height - PAGE_BOTTOM_MARGIN;
}

function addPageIfNeeded(doc: PDFKit.PDFDocument, requiredHeight: number, redraw?: () => void) {
  if (doc.y + requiredHeight <= pageBottom(doc)) {
    return;
  }
  doc.addPage();
  redraw?.();
}

function drawHeader(doc: PDFKit.PDFDocument, model: ReportViewModel) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  doc.rect(PAGE_MARGIN, PAGE_MARGIN, width, 62).fill("#0f172a");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18).text("The Machinists Institute", PAGE_MARGIN + 16, PAGE_MARGIN + 12);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#cbd5e1")
    .text("PLC Crosswalk", PAGE_MARGIN + 16, PAGE_MARGIN + 35);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#ffffff")
    .text(model.title, PAGE_MARGIN + 390, PAGE_MARGIN + 14, { align: "right", width: width - 406 });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#cbd5e1")
    .text(`Generated ${formatDateTime(model.generatedAt)}`, PAGE_MARGIN + 390, PAGE_MARGIN + 36, {
      align: "right",
      width: width - 406,
    });
  doc.y = PAGE_MARGIN + 78;
}

function drawField(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#64748b").text(label.toUpperCase(), x, y, { width });
  doc.font("Helvetica").fontSize(9).fillColor("#0f172a").text(value, x, y + 11, { width, ellipsis: true });
}

function drawStudentBlock(doc: PDFKit.PDFDocument, model: ReportViewModel) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  const y = doc.y;
  doc.roundedRect(PAGE_MARGIN, y, width, 58, 4).fillAndStroke("#f8fafc", "#cbd5e1");
  const colWidth = width / 4;
  drawField(doc, "Student", model.studentName, PAGE_MARGIN + 12, y + 10, colWidth - 18);
  drawField(doc, "Student Ref", model.studentRef, PAGE_MARGIN + colWidth + 6, y + 10, colWidth - 18);
  drawField(doc, "Institution", model.institutionName, PAGE_MARGIN + colWidth * 2 + 6, y + 10, colWidth - 18);
  drawField(doc, "Selected Program", model.programName, PAGE_MARGIN + colWidth * 3 + 6, y + 10, colWidth - 18);
  drawField(doc, "Transcript ID", model.transcriptId, PAGE_MARGIN + 12, y + 34, colWidth - 18);
  drawField(doc, "Uploaded", formatDateTime(model.uploadedAt), PAGE_MARGIN + colWidth + 6, y + 34, colWidth - 18);
  drawField(doc, "Plan Status", model.planStatus, PAGE_MARGIN + colWidth * 2 + 6, y + 34, colWidth - 18);
  drawField(doc, "Approved", model.approvedAt, PAGE_MARGIN + colWidth * 3 + 6, y + 34, colWidth - 18);
  doc.y = y + 74;
}

function drawSummaryCard(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, fill: string) {
  doc.roundedRect(x, y, width, 42, 4).fillAndStroke(fill, "#cbd5e1");
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#475569").text(label.toUpperCase(), x + 9, y + 8, { width: width - 18 });
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(value, x + 9, y + 21, { width: width - 18 });
}

function drawSummaryBand(doc: PDFKit.PDFDocument, model: ReportViewModel) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  const gap = 8;
  const cardWidth = (width - gap * 4) / 5;
  const y = doc.y;
  drawSummaryCard(
    doc,
    "Awarded",
    `${formatMiHours(model.summary.awardedHours)} / ${formatMiCredits(model.summary.awardedCredits)}`,
    PAGE_MARGIN,
    y,
    cardWidth,
    "#ecfdf5",
  );
  drawSummaryCard(doc, "Awarded Rows", String(model.summary.awardedRows), PAGE_MARGIN + (cardWidth + gap), y, cardWidth, "#f8fafc");
  drawSummaryCard(
    doc,
    "Not Awarded",
    String(model.summary.notAwardedRows),
    PAGE_MARGIN + (cardWidth + gap) * 2,
    y,
    cardWidth,
    "#fffbeb",
  );
  drawSummaryCard(
    doc,
    "Pending",
    String(model.summary.pendingRows),
    PAGE_MARGIN + (cardWidth + gap) * 3,
    y,
    cardWidth,
    "#f1f5f9",
  );
  const remainingText =
    model.summary.remainingProgramHours == null
      ? "N/A"
      : `${formatMiHours(model.summary.remainingProgramHours)} / ${formatMiCredits(model.summary.remainingProgramCredits)}`;
  drawSummaryCard(doc, "Remaining Program", remainingText, PAGE_MARGIN + (cardWidth + gap) * 4, y, cardWidth, "#eef2ff");
  doc.y = y + 58;
}

function cellTextHeight(doc: PDFKit.PDFDocument, text: string, width: number, fontSize = 7.5) {
  doc.font("Helvetica").fontSize(fontSize);
  return doc.heightOfString(text || " ", { width: width - 10, lineGap: 1 }) + 10;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: Array<{ label: string; width: number }>,
  title?: string,
) {
  if (title) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(title, PAGE_MARGIN, doc.y);
    doc.y += 8;
  }
  const y = doc.y;
  let x = PAGE_MARGIN;
  for (const column of columns) {
    doc.rect(x, y, column.width, 22).fillAndStroke("#e2e8f0", "#cbd5e1");
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#334155").text(column.label.toUpperCase(), x + 5, y + 7, {
      width: column.width - 10,
    });
    x += column.width;
  }
  doc.y = y + 22;
}

function statusFill(status: ReportStatusLabel) {
  if (status === "Awarded") {
    return { fill: "#dcfce7", text: "#166534" };
  }
  if (status === "Not Awarded") {
    return { fill: "#fef3c7", text: "#92400e" };
  }
  return { fill: "#e2e8f0", text: "#475569" };
}

function drawMainRow(doc: PDFKit.PDFDocument, row: ReportTableRow, rowIndex: number) {
  const values = MAIN_TABLE_COLUMNS.map((column) => String(row[column.key] ?? ""));
  const rowHeight = Math.max(32, ...MAIN_TABLE_COLUMNS.map((column, index) => cellTextHeight(doc, values[index]!, column.width)));
  addPageIfNeeded(doc, rowHeight, () => drawTableHeader(doc, MAIN_TABLE_COLUMNS));

  const y = doc.y;
  let x = PAGE_MARGIN;
  const rowFill = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
  for (const column of MAIN_TABLE_COLUMNS) {
    const isStatus = column.key === "status";
    const tone = isStatus ? statusFill(row.status) : null;
    doc.rect(x, y, column.width, rowHeight).fillAndStroke(tone?.fill ?? rowFill, "#e2e8f0");
    doc
      .font(isStatus ? "Helvetica-Bold" : "Helvetica")
      .fontSize(7.5)
      .fillColor(tone?.text ?? "#0f172a")
      .text(String(row[column.key] ?? ""), x + 5, y + 6, {
        width: column.width - 10,
        height: rowHeight - 10,
        lineGap: 1,
        ellipsis: true,
      });
    x += column.width;
  }
  doc.y = y + rowHeight;
}

function drawDetailRow(doc: PDFKit.PDFDocument, row: ReportTableRow, rowIndex: number) {
  const values = ADMIN_DETAIL_COLUMNS.map((column) => String(row.adminDetail[column.key] ?? ""));
  const rowHeight = Math.max(30, ...ADMIN_DETAIL_COLUMNS.map((column, index) => cellTextHeight(doc, values[index]!, column.width)));
  addPageIfNeeded(doc, rowHeight, () => drawTableHeader(doc, ADMIN_DETAIL_COLUMNS));

  const y = doc.y;
  let x = PAGE_MARGIN;
  const rowFill = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
  for (const column of ADMIN_DETAIL_COLUMNS) {
    doc.rect(x, y, column.width, rowHeight).fillAndStroke(rowFill, "#e2e8f0");
    doc.font("Helvetica").fontSize(7.5).fillColor("#0f172a").text(String(row.adminDetail[column.key] ?? ""), x + 5, y + 6, {
      width: column.width - 10,
      height: rowHeight - 10,
      lineGap: 1,
      ellipsis: true,
    });
    x += column.width;
  }
  doc.y = y + rowHeight;
}

function drawTables(doc: PDFKit.PDFDocument, model: ReportViewModel) {
  addPageIfNeeded(doc, 64);
  drawTableHeader(doc, MAIN_TABLE_COLUMNS, "Course Credit Evaluation");
  if (model.rows.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64748b")
      .text("No mapping decisions have been recorded for this transcript.", PAGE_MARGIN, doc.y + 10);
    doc.y += 30;
  } else {
    model.rows.forEach((row, index) => drawMainRow(doc, row, index));
  }

  if (model.format === ReportFormat.ADMIN && model.rows.length > 0) {
    doc.y += 18;
    addPageIfNeeded(doc, 66);
    drawTableHeader(doc, ADMIN_DETAIL_COLUMNS, "Administrative Review Detail");
    model.rows.forEach((row, index) => drawDetailRow(doc, row, index));
  }
}

function drawFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const pageNumber = index - range.start + 1;
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#64748b")
      .text(
        `The Machinists Institute PLC Crosswalk | Page ${pageNumber} of ${range.count}`,
        PAGE_MARGIN,
        doc.page.height - 27,
        { align: "center", width: doc.page.width - PAGE_MARGIN * 2 },
      );
  }
}

export function renderReportPdfBuffer(model: ReportViewModel) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: true,
      bufferPages: true,
      layout: "landscape",
      margin: PAGE_MARGIN,
      size: "LETTER",
      info: {
        Author: "The Machinists Institute",
        Subject: "PLC Crosswalk credit evaluation",
        Title: model.title,
      },
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    drawHeader(doc, model);
    drawStudentBlock(doc, model);
    drawSummaryBand(doc, model);
    drawTables(doc, model);
    drawFooter(doc);
    doc.end();
  });
}

export async function buildReportPdfBuffer(
  transcript: TranscriptForReport,
  format: ReportFormat,
  generatedAt = new Date(),
) {
  return renderReportPdfBuffer(buildReportViewModel(transcript, format, generatedAt));
}
