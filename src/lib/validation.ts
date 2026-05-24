import { z } from "zod";

const optionalShortTextSchema = z.string().trim().max(100).optional().or(z.literal(""));
const requiredTextSchema = z.string().trim().min(1);

export const uploadTranscriptSchema = z.discriminatedUnion("uploadMode", [
  z.object({
    uploadMode: z.literal("new"),
    studentFirstName: requiredTextSchema,
    studentLastName: requiredTextSchema,
    studentRef: optionalShortTextSchema,
    institutionName: requiredTextSchema,
    existingTranscriptId: z.string().trim().optional().or(z.literal("")),
  }),
  z.object({
    uploadMode: z.literal("existing"),
    existingTranscriptId: z.string().cuid(),
    institutionName: optionalShortTextSchema,
    studentFirstName: optionalShortTextSchema,
    studentLastName: optionalShortTextSchema,
    studentRef: optionalShortTextSchema,
  }),
]);
export type UploadTranscriptInput = z.infer<typeof uploadTranscriptSchema>;

const optionalNoteSchema = z.string().trim().max(4000).optional().or(z.literal(""));

function parseJsonString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const programSelectionSchema = z.object({
  transcriptId: z.string().cuid(),
  programId: z.string().cuid(),
});

export const courseMappingDecisionSchema = z.object({
  transcriptId: z.string().cuid(),
  externalCourseId: z.string().cuid(),
  rationale: optionalNoteSchema,
  evidenceNote: optionalNoteSchema,
  selectedProgramCourseIds: z.preprocess(
    parseJsonString,
    z.array(z.string().cuid()),
  ),
  creditAllocations: z.preprocess(
    parseJsonString,
    z.record(z.string(), z.union([z.number(), z.null()])),
  ),
});

export const noCreditDecisionSchema = z.object({
  transcriptId: z.string().cuid(),
  externalCourseId: z.string().cuid(),
  decisionType: z.enum(["no_credit", "credit_only", "unreviewed"]),
  rationale: optionalNoteSchema,
  evidenceNote: optionalNoteSchema,
});

export const finalizePlanSchema = z.object({
  transcriptId: z.string().cuid(),
});

export const toggleJourneyCourseSchema = z.object({
  transcriptId: z.string().cuid(),
  programCourseId: z.string().cuid(),
  groupId: z.string().cuid().optional().or(z.literal("")),
});

export const createJourneyGroupSchema = z.object({
  transcriptId: z.string().cuid(),
  label: z.string().trim().min(1).max(64),
});

export const renameJourneyGroupSchema = z.object({
  transcriptId: z.string().cuid(),
  groupId: z.string().cuid(),
  label: z.string().trim().min(1).max(64),
});

export const deleteJourneyGroupSchema = z.object({
  transcriptId: z.string().cuid(),
  groupId: z.string().cuid(),
});

export const moveJourneyGroupSchema = z.object({
  transcriptId: z.string().cuid(),
  groupId: z.string().cuid(),
  direction: z.enum(["up", "down"]),
});

export const moveJourneyCourseSchema = z.object({
  transcriptId: z.string().cuid(),
  programCourseId: z.string().cuid(),
  direction: z.enum(["up", "down"]),
});

const optionalCourseTextSchema = z.string().trim().max(255).optional().or(z.literal(""));
const courseTitleSchema = z.string().trim().min(1).max(255);

const creditsFieldSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}, z.number().min(0).max(99.99).nullable());

export const createExternalCourseSchema = z.object({
  transcriptId: z.string().cuid(),
  courseCode: optionalCourseTextSchema,
  title: courseTitleSchema,
  credits: creditsFieldSchema,
  grade: optionalCourseTextSchema,
  termLabel: optionalCourseTextSchema,
});

export const updateExternalCourseSchema = createExternalCourseSchema.extend({
  externalCourseId: z.string().cuid(),
});

export const deleteExternalCourseSchema = z.object({
  transcriptId: z.string().cuid(),
  externalCourseId: z.string().cuid(),
});

export const deleteTranscriptSchema = z.object({
  transcriptId: z.string().cuid(),
});

export const updateTranscriptInstitutionSchema = z.object({
  transcriptId: z.string().cuid(),
  institutionName: z.string().trim().min(1).max(255),
  returnCourseId: z.string().cuid().optional().or(z.literal("")),
});

export const generateReportSchema = z.object({
  transcriptId: z.string().cuid(),
  format: z.enum(["ADMIN", "STUDENT"]),
});
