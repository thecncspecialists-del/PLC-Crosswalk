"use server";

import { ActionHistoryStatus, ReportFormat } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { recordActionHistory } from "@/lib/action-history";
import { db } from "@/lib/db";
import { requireAdminUser } from "@/lib/permissions";
import { buildReportContent } from "@/lib/report-builder";
import { saveUploadFile } from "@/lib/storage";
import { generateReportSchema } from "@/lib/validation";

export async function generateReportAction(formData: FormData) {
  const parsed = generateReportSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    format: formData.get("format"),
  });

  if (!parsed.success) {
    return;
  }

  const adminUser = await requireAdminUser();
  const transcript = await db.transcript.findUnique({
    where: { id: parsed.data.transcriptId },
    include: {
      student: true,
      institution: true,
      mappingPlan: {
        include: {
          selectedProgram: true,
          decisions: {
            include: {
              externalCourse: true,
              selections: {
                include: {
                  programCourse: true,
                },
              },
              evidence: true,
            },
          },
        },
      },
    },
  });

  if (!transcript) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "report_generate",
      description: "Report generation was skipped because the transcript was not found.",
      area: "reports",
      affectedType: "transcript",
      affectedId: parsed.data.transcriptId,
      status: ActionHistoryStatus.WARNING,
      metadata: {
        format: parsed.data.format,
      },
    });
    return;
  }

  const format = parsed.data.format as ReportFormat;
  const reportText = buildReportContent(transcript, format);
  const extension = format === ReportFormat.ADMIN ? "txt" : "txt";
  const reportPath = await saveUploadFile(
    "reports",
    `${transcript.id}-${format.toLowerCase()}.${extension}`,
    Buffer.from(reportText, "utf-8"),
  );

  const report = await db.report.create({
    data: {
      transcriptId: transcript.id,
      format,
      fileUrl: reportPath,
      generatedById: adminUser.id,
    },
    select: {
      id: true,
    },
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "report_generate",
    description: `Generated a ${format.toLowerCase()} report.`,
    area: "reports",
    affectedType: "report",
    affectedId: report.id,
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      transcriptId: transcript.id,
      format,
    },
  });

  revalidatePath("/reports");
  revalidatePath(`/transcripts/${transcript.id}`);
}
