import { CourseDecisionStatus, EvidenceKind, MappingPlanStatus, ParserStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { buildMappingSuggestions } from "@/lib/matcher";
import { saveUploadFile } from "@/lib/storage";
import { parseTranscript } from "@/lib/transcript-parser";
import type { UploadTranscriptInput } from "@/lib/validation";

export type TranscriptUploadResult = {
  transcriptId: string;
  transcriptFileId: string;
  firstExternalCourseId: string | null;
  parserStatus: string;
  extractedCourses: number;
  suggestions: number;
};

export type ExistingTranscriptFileRepairResult = {
  transcriptId: string;
  transcriptFileId: string;
  fileUrl: string;
  parserStatus: ParserStatus;
  preservedCourses: number;
};

export type TranscriptUploadNotice =
  | "upload_missing_file"
  | "upload_invalid_file_type"
  | "upload_invalid_metadata"
  | "upload_failed";

export type TranscriptUploadFileValidation =
  | {
      ok: true;
      file: File;
    }
  | {
      ok: false;
      notice: Extract<TranscriptUploadNotice, "upload_missing_file" | "upload_invalid_file_type">;
    };

type CreatedCourse = {
  id: string;
  title: string;
  credits: { toString: () => string } | number | string | null;
  grade: string | null;
  sourceSnippet: string | null;
};

async function createLegacyMappingSuggestions(transcriptId: string, createdCourses: CreatedCourse[]) {
  const programCourses = await db.programCourse.findMany({
    where: {
      programId: {
        not: null,
      },
    },
    include: {
      outcomes: true,
    },
  });

  const suggestions = buildMappingSuggestions(
    createdCourses.map((course) => ({
      id: course.id,
      title: course.title,
      credits: course.credits ? Number(course.credits) : null,
      grade: course.grade,
      sourceSnippet: course.sourceSnippet,
    })),
    programCourses,
  );

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

  return suggestions.length;
}

export async function validateTranscriptUploadFile(file: unknown): Promise<TranscriptUploadFileValidation> {
  if (!(file instanceof File) || file.size === 0 || file.name.trim().length === 0) {
    return {
      ok: false,
      notice: "upload_missing_file",
    };
  }

  const normalizedName = file.name.trim().toLowerCase();
  const normalizedType = file.type.trim().toLowerCase();
  const hasPdfExtension = normalizedName.endsWith(".pdf");
  const hasPdfMimeType = normalizedType === "" || normalizedType === "application/pdf";
  if (!hasPdfExtension || !hasPdfMimeType) {
    return {
      ok: false,
      notice: "upload_invalid_file_type",
    };
  }

  const header = Buffer.from(await file.slice(0, 5).arrayBuffer()).toString("utf8");
  if (header !== "%PDF-") {
    return {
      ok: false,
      notice: "upload_invalid_file_type",
    };
  }

  return {
    ok: true,
    file,
  };
}

export async function createTranscriptFromUpload(args: {
  file: File;
  input: UploadTranscriptInput;
}) {
  const { file, input } = args;
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileUrl = await saveUploadFile("transcripts", file.name, fileBuffer);
  const parsedTranscript = await parseTranscript(fileBuffer);

  const uploadRecord = await db.$transaction(async (tx) => {
    let transcriptId: string;
    let mappingPlanId: string;

    if (input.uploadMode === "existing") {
      const existingTranscript = await tx.transcript.findUnique({
        where: { id: input.existingTranscriptId },
        include: {
          mappingPlan: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!existingTranscript) {
        throw new Error("Unable to resolve transcript for append upload.");
      }

      transcriptId = existingTranscript.id;
      if (existingTranscript.mappingPlan?.id) {
        mappingPlanId = existingTranscript.mappingPlan.id;
        await tx.mappingPlan.update({
          where: { id: mappingPlanId },
          data: {
            status: MappingPlanStatus.DRAFT,
            approvedById: null,
            approvedAt: null,
          },
        });
      } else {
        const createdPlan = await tx.mappingPlan.create({
          data: {
            transcriptId,
          },
          select: {
            id: true,
          },
        });
        mappingPlanId = createdPlan.id;
      }
    } else {
      const institution = await tx.institution.upsert({
        where: { name: input.institutionName },
        update: {},
        create: { name: input.institutionName },
      });

      const student = await tx.student.create({
        data: {
          firstName: input.studentFirstName,
          lastName: input.studentLastName,
          studentRef: input.studentRef || null,
        },
        select: {
          id: true,
        },
      });

      const transcript = await tx.transcript.create({
        data: {
          studentId: student.id,
          institutionId: institution.id,
          fileName: file.name,
          fileUrl,
          parserStatus: parsedTranscript.parserStatus,
          rawText: parsedTranscript.rawText,
        },
        select: {
          id: true,
        },
      });

      const mappingPlan = await tx.mappingPlan.create({
        data: {
          transcriptId: transcript.id,
        },
        select: {
          id: true,
        },
      });

      transcriptId = transcript.id;
      mappingPlanId = mappingPlan.id;
    }

    const transcriptFile = await tx.transcriptFile.create({
      data: {
        transcriptId,
        fileName: file.name,
        fileUrl,
        parserStatus: parsedTranscript.parserStatus,
        rawText: parsedTranscript.rawText,
      },
      select: {
        id: true,
      },
    });

    const createdCourses = [];
    for (const course of parsedTranscript.courses) {
      const externalCourse = await tx.externalCourse.create({
        data: {
          transcriptId,
          transcriptFileId: transcriptFile.id,
          courseCode: course.courseCode,
          title: course.title,
          credits: course.credits,
          grade: course.grade,
          termLabel: course.termLabel,
          sourceSnippet: course.sourceSnippet,
        },
        select: {
          id: true,
          title: true,
          credits: true,
          grade: true,
          sourceSnippet: true,
        },
      });
      createdCourses.push(externalCourse);

      await tx.courseMappingDecision.create({
        data: {
          mappingPlanId,
          externalCourseId: externalCourse.id,
          status: CourseDecisionStatus.UNREVIEWED,
        },
      });
    }

    return {
      transcriptId,
      transcriptFileId: transcriptFile.id,
      firstExternalCourseId: createdCourses[0]?.id ?? null,
      createdCourses,
    };
  });

  let suggestionsCount = 0;
  try {
    suggestionsCount = await createLegacyMappingSuggestions(uploadRecord.transcriptId, uploadRecord.createdCourses);
  } catch {
    // Legacy suggestions are advisory; the reviewer-facing course decisions are already created.
  }

  return {
    transcriptId: uploadRecord.transcriptId,
    transcriptFileId: uploadRecord.transcriptFileId,
    firstExternalCourseId: uploadRecord.firstExternalCourseId,
    parserStatus: parsedTranscript.parserStatus,
    extractedCourses: uploadRecord.createdCourses.length,
    suggestions: suggestionsCount,
  } satisfies TranscriptUploadResult;
}

export async function repairExistingTranscriptSourceFile(args: {
  file: File;
  transcriptId: string;
}) {
  const { file, transcriptId } = args;
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileUrl = await saveUploadFile("transcripts", file.name, fileBuffer);

  return db.$transaction(async (tx) => {
    const transcript = await tx.transcript.findUnique({
      where: { id: transcriptId },
      include: {
        files: {
          orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            parserStatus: true,
            rawText: true,
          },
        },
        externalCourses: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!transcript) {
      throw new Error("Unable to resolve transcript for source PDF repair.");
    }

    await tx.transcript.update({
      where: { id: transcript.id },
      data: {
        fileName: file.name,
        fileUrl,
      },
    });

    const existingFile = transcript.files[0] ?? null;
    const transcriptFile = existingFile
      ? await tx.transcriptFile.update({
          where: { id: existingFile.id },
          data: {
            fileName: file.name,
            fileUrl,
          },
          select: {
            id: true,
            parserStatus: true,
          },
        })
      : await tx.transcriptFile.create({
          data: {
            transcriptId: transcript.id,
            fileName: file.name,
            fileUrl,
            parserStatus: transcript.parserStatus,
            rawText: transcript.rawText,
          },
          select: {
            id: true,
            parserStatus: true,
          },
        });

    return {
      transcriptId: transcript.id,
      transcriptFileId: transcriptFile.id,
      fileUrl,
      parserStatus: transcriptFile.parserStatus,
      preservedCourses: transcript.externalCourses.length,
    } satisfies ExistingTranscriptFileRepairResult;
  });
}
