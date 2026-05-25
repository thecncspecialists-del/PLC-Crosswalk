"use server";

import { ActionHistoryStatus, ReportFormat } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { recordActionHistory } from "@/lib/action-history";
import { db } from "@/lib/db";
import { requireAdminUser } from "@/lib/permissions";
import { buildReportPdfBuffer } from "@/lib/report-builder";
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
          selectedProgram: {
            include: {
              courses: {
                include: {
                  outcomes: true,
                },
                orderBy: { code: "asc" },
              },
            },
          },
          journeyCourses: {
            include: {
              programCourse: true,
            },
          },
          decisions: {
            orderBy: { createdAt: "asc" },
            include: {
              externalCourse: true,
              selections: {
                orderBy: { createdAt: "asc" },
                include: {
                  programCourse: {
                    include: {
                      outcomes: true,
                    },
                  },
                },
              },
              evidence: true,
              reviewedBy: {
                select: {
                  email: true,
                  name: true,
                },
              },
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
  const generatedAt = new Date();
  let report: { id: string };
  try {
    const reportPdf = await buildReportPdfBuffer(transcript, format, generatedAt);
    const reportPath = await saveUploadFile(
      "reports",
      `${transcript.id}-${format.toLowerCase()}.pdf`,
      reportPdf,
      { contentType: "application/pdf" },
    );

    report = await db.report.create({
      data: {
        transcriptId: transcript.id,
        format,
        fileUrl: reportPath,
        generatedById: adminUser.id,
        generatedAt,
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "report_generate",
      description: `Failed to generate a ${format.toLowerCase()} PDF report.`,
      area: "reports",
      affectedType: "transcript",
      affectedId: transcript.id,
      status: ActionHistoryStatus.ERROR,
      metadata: {
        transcriptId: transcript.id,
        format,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    revalidatePath("/reports");
    revalidatePath(`/transcripts/${transcript.id}`);
    return;
  }

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
