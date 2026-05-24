import { NextResponse } from "next/server";
import { ActionHistoryStatus } from "@prisma/client";

import { recordActionHistory } from "@/lib/action-history";
import { getAdminSessionUser } from "@/lib/permissions";
import { createTranscriptFromUpload } from "@/lib/transcript-upload";
import { uploadTranscriptSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const adminUser = await getAdminSessionUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_upload",
      description: "Transcript API upload was rejected because no PDF file was submitted.",
      area: "transcripts",
      affectedType: "transcript",
      status: ActionHistoryStatus.WARNING,
    });
    return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
  }

  const parsedMetadata = uploadTranscriptSchema.safeParse({
    uploadMode: String(formData.get("uploadMode") ?? "new"),
    existingTranscriptId: formData.get("existingTranscriptId"),
    studentFirstName: formData.get("studentFirstName"),
    studentLastName: formData.get("studentLastName"),
    studentRef: formData.get("studentRef"),
    institutionName: formData.get("institutionName"),
  });

  if (!parsedMetadata.success) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_upload",
      description: "Transcript API upload was rejected because metadata was invalid.",
      area: "transcripts",
      affectedType: "transcript",
      status: ActionHistoryStatus.WARNING,
      metadata: {
        fileName: file.name,
        issues: parsedMetadata.error.issues.map((issue) => issue.path.join(".")),
      },
    });
    return NextResponse.json({ error: "Invalid transcript metadata." }, { status: 400 });
  }

  let uploadResult: Awaited<ReturnType<typeof createTranscriptFromUpload>>;
  try {
    uploadResult = await createTranscriptFromUpload({
      file,
      input: parsedMetadata.data,
    });
  } catch (error) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_upload",
      description: "Transcript API upload failed before a transcript record could be created.",
      area: "transcripts",
      affectedType: "transcript",
      status: ActionHistoryStatus.ERROR,
      metadata: {
        fileName: file.name,
        uploadMode: parsedMetadata.data.uploadMode,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
    return NextResponse.json({ error: "Unable to create transcript upload." }, { status: 400 });
  }

  await recordActionHistory({
    actor: adminUser,
    actionType: "transcript_upload",
    description:
      parsedMetadata.data.uploadMode === "existing"
        ? "Appended a transcript file to an existing transcript record through the API."
        : "Uploaded and parsed a new transcript through the API.",
    area: "transcripts",
    affectedType: "transcript",
    affectedId: uploadResult.transcriptId,
    status: uploadResult.extractedCourses > 0 ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      fileName: file.name,
      uploadMode: parsedMetadata.data.uploadMode,
      transcriptFileId: uploadResult.transcriptFileId,
      parserStatus: uploadResult.parserStatus,
      extractedCourses: uploadResult.extractedCourses,
      suggestions: uploadResult.suggestions,
    },
  });

  return NextResponse.json({
    ok: true,
    transcriptId: uploadResult.transcriptId,
    transcriptFileId: uploadResult.transcriptFileId,
    firstExternalCourseId: uploadResult.firstExternalCourseId,
    parserStatus: uploadResult.parserStatus,
    extractedCourses: uploadResult.extractedCourses,
    suggestions: uploadResult.suggestions,
  });
}
