"use server";

import { ActionHistoryStatus, CourseDecisionStatus, EvidenceKind, MappingPlanStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseCatalogWorkbook } from "@/lib/catalog-parser";
import { importCatalogRows } from "@/lib/catalog-import";
import { appLogger } from "@/lib/app-logger";
import { recordActionHistory } from "@/lib/action-history";
import { db } from "@/lib/db";
import { formatGrade } from "@/lib/grade-format";
import { buildMappingSuggestions } from "@/lib/matcher";
import { requireAdminUser } from "@/lib/permissions";
import { deleteStoredFile } from "@/lib/storage";
import { createTranscriptFromUpload, validateTranscriptUploadFile } from "@/lib/transcript-upload";
import {
  createExternalCourseSchema,
  deleteExternalCourseSchema,
  deleteTranscriptSchema,
  updateTranscriptInstitutionSchema,
  updateExternalCourseSchema,
  uploadTranscriptSchema,
} from "@/lib/validation";

async function ensureTranscriptMappingPlan(transcriptId: string) {
  const transcript = await db.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      id: true,
      mappingPlan: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!transcript) {
    return null;
  }

  if (transcript.mappingPlan?.id) {
    return transcript.mappingPlan.id;
  }

  const createdPlan = await db.mappingPlan.create({
    data: {
      transcriptId,
    },
    select: {
      id: true,
    },
  });

  return createdPlan.id;
}

async function resetPlanToDraft(mappingPlanId: string) {
  await db.mappingPlan.update({
    where: { id: mappingPlanId },
    data: {
      status: MappingPlanStatus.DRAFT,
      approvedById: null,
      approvedAt: null,
    },
  });
}

export async function uploadTranscriptAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const file = formData.get("file");
  const fileValidation = await validateTranscriptUploadFile(file);
  if (!fileValidation.ok) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_upload",
      description:
        fileValidation.notice === "upload_missing_file"
          ? "Transcript upload was skipped because no PDF file was submitted."
          : "Transcript upload was rejected because the submitted file was not a valid PDF.",
      area: "transcripts",
      affectedType: "transcript",
      status: ActionHistoryStatus.WARNING,
      metadata: {
        notice: fileValidation.notice,
        fileName: file instanceof File ? file.name : null,
        fileType: file instanceof File ? file.type : null,
      },
    });
    redirect(`/transcripts?notice=${fileValidation.notice}`);
  }
  const uploadFile = fileValidation.file;

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
      description: "Transcript upload was rejected because metadata was invalid.",
      area: "transcripts",
      affectedType: "transcript",
      status: ActionHistoryStatus.WARNING,
      metadata: {
        fileName: uploadFile.name,
        issues: parsedMetadata.error.issues.map((issue) => issue.path.join(".")),
      },
    });
    redirect("/transcripts?notice=upload_invalid_metadata");
  }

  let uploadResult: Awaited<ReturnType<typeof createTranscriptFromUpload>>;
  try {
    uploadResult = await createTranscriptFromUpload({
      file: uploadFile,
      input: parsedMetadata.data,
    });
  } catch (error) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_upload",
      description: "Transcript upload failed before a transcript record could be created.",
      area: "transcripts",
      affectedType: "transcript",
      status: ActionHistoryStatus.ERROR,
      metadata: {
        fileName: uploadFile.name,
        uploadMode: parsedMetadata.data.uploadMode,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
    redirect("/transcripts?notice=upload_failed");
  }

  await recordActionHistory({
    actor: adminUser,
    actionType: "transcript_upload",
    description:
      parsedMetadata.data.uploadMode === "existing"
        ? "Appended a transcript file to an existing transcript record."
        : "Uploaded and parsed a new transcript.",
    area: "transcripts",
    affectedType: "transcript",
    affectedId: uploadResult.transcriptId,
    status: uploadResult.extractedCourses > 0 ? ActionHistoryStatus.SUCCESS : ActionHistoryStatus.WARNING,
    metadata: {
      fileName: uploadFile.name,
      uploadMode: parsedMetadata.data.uploadMode,
      transcriptFileId: uploadResult.transcriptFileId,
      parserStatus: uploadResult.parserStatus,
      extractedCourses: uploadResult.extractedCourses,
      suggestions: uploadResult.suggestions,
    },
  });

  revalidatePath("/transcripts");
  const courseQuery = uploadResult.firstExternalCourseId ? `?courseId=${uploadResult.firstExternalCourseId}` : "";
  redirect(`/transcripts/${uploadResult.transcriptId}${courseQuery}`);
}

export async function importCatalogAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "catalog_import",
      description: "Catalog import was skipped because no workbook file was submitted.",
      area: "catalog",
      affectedType: "program_catalog",
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const replaceExisting = String(formData.get("replaceExisting") ?? "true") === "true";
  const buffer = Buffer.from(await file.arrayBuffer());
  let parsedCatalog: ReturnType<typeof parseCatalogWorkbook>;
  try {
    parsedCatalog = parseCatalogWorkbook(buffer);
  } catch (error) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "catalog_import",
      description: "Catalog import failed while parsing the workbook.",
      area: "catalog",
      affectedType: "program_catalog",
      status: ActionHistoryStatus.ERROR,
      metadata: {
        fileName: file.name,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
    return;
  }
  const rows = parsedCatalog.rows;

  if (rows.length === 0) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "catalog_import",
      description: "Catalog import found no curriculum rows.",
      area: "catalog",
      affectedType: "program_catalog",
      status: ActionHistoryStatus.WARNING,
      metadata: {
        fileName: file.name,
        parserSummary: parsedCatalog.summary,
      },
    });
    return;
  }

  const importSummary = await importCatalogRows({
    rows,
    replaceExisting,
    resetMappings: replaceExisting,
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "catalog_import",
    description: "Imported curriculum catalog workbook.",
    area: "catalog",
    affectedType: "program_catalog",
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      fileName: file.name,
      replaceExisting,
      importedRows: importSummary.importedRows,
      programs: importSummary.programs,
      courses: importSummary.courses,
      outcomes: importSummary.outcomes,
      resetDecisionCount: importSummary.resetDecisionCount,
      resetPlanCount: importSummary.resetPlanCount,
      parserSummary: parsedCatalog.summary,
    },
  });
  revalidatePath("/transcripts");
  revalidatePath("/reports");
}

export async function regenerateMappingSuggestionsAction(formData: FormData) {
  const transcriptId = String(formData.get("transcriptId") ?? "");
  if (!transcriptId) {
    return;
  }

  const adminUser = await requireAdminUser();

  const transcript = await db.transcript.findUnique({
    where: { id: transcriptId },
    include: {
      externalCourses: true,
      mappingPlan: true,
    },
  });

  if (!transcript) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "mapping_suggestions_regenerate",
      description: "Mapping suggestions were not regenerated because the transcript was not found.",
      area: "mapping",
      affectedType: "transcript",
      affectedId: transcriptId,
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const programCourseWhere = transcript.mappingPlan?.selectedProgramId
    ? {
        programId: transcript.mappingPlan.selectedProgramId,
      }
    : {
        programId: {
          not: null,
        },
      };

  const programCourses = await db.programCourse.findMany({
    where: programCourseWhere,
    include: { outcomes: true },
  });

  await db.mappingDecision.deleteMany({
    where: {
      transcriptId,
      status: "SUGGESTED",
    },
  });

  const suggestions = buildMappingSuggestions(
    transcript.externalCourses.map((course) => ({
      id: course.id,
      title: course.title,
      credits: course.credits ? Number(course.credits) : null,
      grade: course.grade,
      sourceSnippet: course.sourceSnippet,
    })),
    programCourses,
  );

  // Legacy mapping suggestions are retained for existing data/internal workflows while
  // the reviewer-facing MappingPlan/CourseMappingDecision path remains primary.
  for (const suggestion of suggestions) {
    await db.mappingDecision.create({
      data: {
        transcriptId,
        externalCourseId: suggestion.externalCourseId,
        programCourseId: suggestion.programCourseId,
        status: suggestion.status,
        confidence: suggestion.confidence,
        rationale: suggestion.rationale,
        plcCreditsGranted: suggestion.plcCreditsGranted,
        evidence: {
          create: [
            {
              kind: EvidenceKind.TRANSCRIPT_TEXT,
              snippet: suggestion.evidence.transcriptSnippet,
            },
            {
              kind: EvidenceKind.CATALOG_OUTCOME,
              snippet: suggestion.evidence.catalogSnippet,
            },
          ],
        },
      },
    });
  }

  await recordActionHistory({
    actor: adminUser,
    actionType: "mapping_suggestions_regenerate",
    description: "Regenerated legacy mapping suggestions for a transcript.",
    area: "mapping",
    affectedType: "transcript",
    affectedId: transcriptId,
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      suggestions: suggestions.length,
    },
  });
  revalidatePath(`/transcripts/${transcriptId}`);
}

export async function updateExternalCourseAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const parsed = updateExternalCourseSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    externalCourseId: formData.get("externalCourseId"),
    courseCode: formData.get("courseCode"),
    title: formData.get("title"),
    credits: formData.get("credits"),
    grade: formData.get("grade"),
    termLabel: formData.get("termLabel"),
  });

  if (!parsed.success) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "external_course_update",
      description: "External course update was rejected because form data was invalid.",
      area: "transcripts",
      affectedType: "external_course",
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const { transcriptId, externalCourseId, courseCode, title, credits, grade, termLabel } = parsed.data;

  const existingCourse = await db.externalCourse.findFirst({
    where: {
      id: externalCourseId,
      transcriptId,
    },
    select: {
      id: true,
    },
  });
  if (!existingCourse) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "external_course_update",
      description: "External course update was skipped because the course was not found.",
      area: "transcripts",
      affectedType: "external_course",
      affectedId: externalCourseId,
      status: ActionHistoryStatus.WARNING,
      metadata: { transcriptId },
    });
    return;
  }

  await db.externalCourse.update({
    where: { id: externalCourseId },
    data: {
      courseCode: courseCode || null,
      title,
      credits,
      grade: formatGrade(grade),
      termLabel: termLabel || null,
    },
  });

  const mappingPlanId = await ensureTranscriptMappingPlan(transcriptId);
  if (mappingPlanId) {
    await resetPlanToDraft(mappingPlanId);
  }

  await recordActionHistory({
    actor: adminUser,
    actionType: "external_course_update",
    description: "Updated an extracted course and returned the mapping plan to draft.",
    area: "transcripts",
    affectedType: "external_course",
    affectedId: externalCourseId,
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      transcriptId,
      courseCode: courseCode || null,
      title,
      hasCredits: credits != null,
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
  redirect(`/transcripts/${transcriptId}?courseId=${externalCourseId}`);
}

export async function createExternalCourseAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const parsed = createExternalCourseSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    courseCode: formData.get("courseCode"),
    title: formData.get("title"),
    credits: formData.get("credits"),
    grade: formData.get("grade"),
    termLabel: formData.get("termLabel"),
  });

  if (!parsed.success) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "external_course_create",
      description: "External course creation was rejected because form data was invalid.",
      area: "transcripts",
      affectedType: "external_course",
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const { transcriptId, courseCode, title, credits, grade, termLabel } = parsed.data;
  const mappingPlanId = await ensureTranscriptMappingPlan(transcriptId);
  if (!mappingPlanId) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "external_course_create",
      description: "External course creation was skipped because the transcript was not found.",
      area: "transcripts",
      affectedType: "transcript",
      affectedId: transcriptId,
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const createdCourse = await db.externalCourse.create({
    data: {
      transcriptId,
      courseCode: courseCode || null,
      title,
      credits,
      grade: formatGrade(grade),
      termLabel: termLabel || null,
      sourceSnippet: "Manually added by reviewer.",
    },
    select: {
      id: true,
    },
  });

  await db.courseMappingDecision.create({
    data: {
      mappingPlanId,
      externalCourseId: createdCourse.id,
      status: CourseDecisionStatus.UNREVIEWED,
    },
  });

  await resetPlanToDraft(mappingPlanId);

  await recordActionHistory({
    actor: adminUser,
    actionType: "external_course_create",
    description: "Manually added an extracted course and returned the mapping plan to draft.",
    area: "transcripts",
    affectedType: "external_course",
    affectedId: createdCourse.id,
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      transcriptId,
      courseCode: courseCode || null,
      title,
      hasCredits: credits != null,
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
  redirect(`/transcripts/${transcriptId}?courseId=${createdCourse.id}`);
}

async function deleteStoredFilesIfPresent(fileUrls: string[]) {
  let failedDeletes = 0;
  await Promise.all(
    fileUrls.map(async (fileUrl) => {
      if (!fileUrl) {
        return;
      }

      try {
        await deleteStoredFile(fileUrl);
      } catch (error) {
        failedDeletes += 1;
        appLogger.warn({
          action: "storage_delete",
          area: "storage",
          status: "warning",
          message: "Stored file cleanup failed after record deletion.",
          metadata: {
            fileUrl,
            errorName: error instanceof Error ? error.name : "UnknownError",
          },
        });
        // File cleanup should not block removing a queue record.
      }
    }),
  );
  return failedDeletes;
}

export async function deleteTranscriptAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const parsed = deleteTranscriptSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
  });

  if (!parsed.success) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_delete",
      description: "Transcript deletion was rejected because form data was invalid.",
      area: "transcripts",
      affectedType: "transcript",
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const transcript = await db.transcript.findUnique({
    where: {
      id: parsed.data.transcriptId,
    },
    select: {
      id: true,
      fileUrl: true,
      files: {
        select: {
          fileUrl: true,
        },
      },
      reports: {
        select: {
          fileUrl: true,
        },
      },
    },
  });

  if (!transcript) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_delete",
      description: "Transcript deletion was skipped because the transcript was not found.",
      area: "transcripts",
      affectedType: "transcript",
      affectedId: parsed.data.transcriptId,
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  await db.transcript.delete({
    where: {
      id: transcript.id,
    },
  });

  const failedStorageDeletes = await deleteStoredFilesIfPresent([
    transcript.fileUrl,
    ...transcript.files.map((file) => file.fileUrl),
    ...transcript.reports.map((report) => report.fileUrl),
  ]);

  await recordActionHistory({
    actor: adminUser,
    actionType: "transcript_delete",
    description: "Deleted a transcript queue record.",
    area: "transcripts",
    affectedType: "transcript",
    affectedId: transcript.id,
    status: failedStorageDeletes > 0 ? ActionHistoryStatus.WARNING : ActionHistoryStatus.SUCCESS,
    metadata: {
      attachedFiles: transcript.files.length + 1,
      reports: transcript.reports.length,
      failedStorageDeletes,
    },
  });

  revalidatePath("/transcripts");
  revalidatePath("/reports");
}

export async function deleteExternalCourseAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const parsed = deleteExternalCourseSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    externalCourseId: formData.get("externalCourseId"),
  });

  if (!parsed.success) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "external_course_delete",
      description: "External course deletion was rejected because form data was invalid.",
      area: "transcripts",
      affectedType: "external_course",
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const { transcriptId, externalCourseId } = parsed.data;
  const mappingPlanId = await ensureTranscriptMappingPlan(transcriptId);

  const courseToDelete = await db.externalCourse.findFirst({
    where: {
      id: externalCourseId,
      transcriptId,
    },
    select: {
      id: true,
    },
  });
  if (!courseToDelete) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "external_course_delete",
      description: "External course deletion was skipped because the course was not found.",
      area: "transcripts",
      affectedType: "external_course",
      affectedId: externalCourseId,
      status: ActionHistoryStatus.WARNING,
      metadata: { transcriptId },
    });
    return;
  }

  await db.externalCourse.delete({
    where: {
      id: externalCourseId,
    },
  });

  if (mappingPlanId) {
    await resetPlanToDraft(mappingPlanId);
  }

  const nextCourse = await db.externalCourse.findFirst({
    where: {
      transcriptId,
    },
    orderBy: [{ termLabel: "asc" }, { title: "asc" }],
    select: {
      id: true,
    },
  });

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");
  await recordActionHistory({
    actor: adminUser,
    actionType: "external_course_delete",
    description: "Deleted an extracted course and returned the mapping plan to draft.",
    area: "transcripts",
    affectedType: "external_course",
    affectedId: externalCourseId,
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      transcriptId,
      nextCourseId: nextCourse?.id ?? null,
    },
  });
  if (nextCourse?.id) {
    redirect(`/transcripts/${transcriptId}?courseId=${nextCourse.id}`);
  }
  redirect(`/transcripts/${transcriptId}`);
}

export async function updateTranscriptInstitutionAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  const parsed = updateTranscriptInstitutionSchema.safeParse({
    transcriptId: formData.get("transcriptId"),
    institutionName: formData.get("institutionName"),
    returnCourseId: formData.get("returnCourseId"),
  });

  if (!parsed.success) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_institution_update",
      description: "Institution update was rejected because form data was invalid.",
      area: "transcripts",
      affectedType: "transcript",
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const { transcriptId, institutionName, returnCourseId } = parsed.data;
  const normalizedInstitutionName = institutionName.trim();

  const transcript = await db.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      id: true,
      institution: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  if (!transcript) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "transcript_institution_update",
      description: "Institution update was skipped because the transcript was not found.",
      area: "transcripts",
      affectedType: "transcript",
      affectedId: transcriptId,
      status: ActionHistoryStatus.WARNING,
    });
    return;
  }

  const previousInstitutionName = transcript.institution.name;
  if (transcript.institution.name !== normalizedInstitutionName) {
    const institution = await db.institution.upsert({
      where: {
        name: normalizedInstitutionName,
      },
      update: {},
      create: {
        name: normalizedInstitutionName,
      },
      select: {
        id: true,
      },
    });

    await db.transcript.update({
      where: { id: transcriptId },
      data: {
        institutionId: institution.id,
      },
    });
  }

  revalidatePath(`/transcripts/${transcriptId}`);
  revalidatePath("/transcripts");
  revalidatePath("/reports");

  await recordActionHistory({
    actor: adminUser,
    actionType: "transcript_institution_update",
    description:
      previousInstitutionName === normalizedInstitutionName
        ? "Institution update was submitted with no change."
        : "Updated the institution on a transcript.",
    area: "transcripts",
    affectedType: "transcript",
    affectedId: transcriptId,
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      previousInstitutionName,
      institutionName: normalizedInstitutionName,
      changed: previousInstitutionName !== normalizedInstitutionName,
    },
  });

  if (returnCourseId) {
    redirect(`/transcripts/${transcriptId}?courseId=${returnCourseId}`);
  }
  redirect(`/transcripts/${transcriptId}`);
}
