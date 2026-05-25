import { NextResponse } from "next/server";
import { ActionHistoryStatus } from "@prisma/client";

import { recordActionHistory } from "@/lib/action-history";
import { appLogger } from "@/lib/app-logger";
import { db } from "@/lib/db";
import { getAdminSessionUser } from "@/lib/permissions";
import { getReportDownloadMetadata } from "@/lib/report-download";
import { deleteStoredFile, readStoredFile } from "@/lib/storage";

type Params = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: Params) {
  const adminUser = await getAdminSessionUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await context.params;
  const report = await db.report.findUnique({
    where: { id: reportId },
    include: {
      transcript: {
        select: {
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "report_download",
      description: "Report download was requested for a missing report.",
      area: "reports",
      affectedType: "report",
      affectedId: reportId,
      status: ActionHistoryStatus.WARNING,
    });
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readStoredFile(report.fileUrl);
  } catch (error) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "report_download",
      description: "Report download failed because the stored file was unavailable.",
      area: "reports",
      affectedType: "report",
      affectedId: report.id,
      status: ActionHistoryStatus.ERROR,
      metadata: {
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
    return NextResponse.json({ error: "Report file not found in storage." }, { status: 404 });
  }

  const downloadMetadata = getReportDownloadMetadata(report, fileBuffer);
  await recordActionHistory({
    actor: adminUser,
    actionType: "report_download",
    description: "Downloaded a generated report.",
    area: "reports",
    affectedType: "report",
    affectedId: report.id,
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      format: report.format,
      transcriptId: report.transcriptId,
    },
  });

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": downloadMetadata.contentType,
      "Content-Disposition": `attachment; filename="${downloadMetadata.fileName.replace(/["\r\n]/g, "_")}"`,
    },
  });
}

export async function DELETE(_request: Request, context: Params) {
  const adminUser = await getAdminSessionUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await context.params;
  const report = await db.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      fileUrl: true,
    },
  });

  if (!report) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "report_delete",
      description: "Report deletion was requested for a missing report.",
      area: "reports",
      affectedType: "report",
      affectedId: reportId,
      status: ActionHistoryStatus.WARNING,
    });
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  await db.report.delete({
    where: { id: report.id },
  });

  let storageDeleteFailed = false;
  try {
    await deleteStoredFile(report.fileUrl);
  } catch (error) {
    storageDeleteFailed = true;
    appLogger.warn({
      action: "report_file_delete",
      area: "storage",
      status: "warning",
      message: "Report file cleanup failed after deleting the database row.",
      metadata: {
        reportId: report.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
    // File may already be absent. Keep API success because DB row is removed.
  }

  await recordActionHistory({
    actor: adminUser,
    actionType: "report_delete",
    description: "Deleted a generated report.",
    area: "reports",
    affectedType: "report",
    affectedId: report.id,
    status: storageDeleteFailed ? ActionHistoryStatus.WARNING : ActionHistoryStatus.SUCCESS,
    metadata: {
      storageDeleteFailed,
    },
  });

  return NextResponse.json({ ok: true });
}
