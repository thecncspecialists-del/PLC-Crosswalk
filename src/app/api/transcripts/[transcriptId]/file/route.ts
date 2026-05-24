import { NextResponse } from "next/server";
import { ActionHistoryStatus } from "@prisma/client";

import { recordActionHistory } from "@/lib/action-history";
import { db } from "@/lib/db";
import { getAdminSessionUser } from "@/lib/permissions";
import { readStoredFile } from "@/lib/storage";

type Params = {
  params: Promise<{
    transcriptId: string;
  }>;
};

function safeHeaderFileName(fileName: string) {
  return fileName.replace(/["\r\n]/g, "_");
}

export async function GET(request: Request, context: Params) {
  const adminUser = await getAdminSessionUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { transcriptId } = await context.params;
  const requestedFileId = new URL(request.url).searchParams.get("fileId");
  const transcript = await db.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      fileName: true,
      fileUrl: true,
      files: {
        where: requestedFileId ? { id: requestedFileId } : undefined,
        orderBy: { uploadedAt: "desc" },
        take: 1,
        select: {
          fileName: true,
          fileUrl: true,
        },
      },
    },
  });

  if (!transcript) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_file_view",
      description: "Transcript file view was requested for a missing transcript.",
      area: "transcripts",
      affectedType: "transcript",
      affectedId: transcriptId,
      status: ActionHistoryStatus.WARNING,
    });
    return NextResponse.json({ error: "Transcript not found." }, { status: 404 });
  }

  const selectedFile = transcript.files[0] ?? null;
  if (requestedFileId && !selectedFile) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_file_view",
      description: "Transcript file view was requested for a missing transcript file.",
      area: "transcripts",
      affectedType: "transcript_file",
      affectedId: requestedFileId,
      status: ActionHistoryStatus.WARNING,
      metadata: {
        transcriptId,
      },
    });
    return NextResponse.json({ error: "Transcript file not found." }, { status: 404 });
  }

  const fileName = selectedFile?.fileName ?? transcript.fileName;
  const fileUrl = selectedFile?.fileUrl ?? transcript.fileUrl;

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readStoredFile(fileUrl);
  } catch (error) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_file_view",
      description: "Transcript file view failed because the stored file was unavailable.",
      area: "transcripts",
      affectedType: selectedFile ? "transcript_file" : "transcript",
      affectedId: selectedFile ? requestedFileId : transcriptId,
      status: ActionHistoryStatus.ERROR,
      metadata: {
        transcriptId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
    return NextResponse.json({ error: "Transcript file not found in storage." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeHeaderFileName(fileName)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
