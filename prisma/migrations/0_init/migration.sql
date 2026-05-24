-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "public"."ActionHistoryStatus" AS ENUM ('SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."ParserStatus" AS ENUM ('PENDING', 'PARSED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."MappingStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'PARTIAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."EvidenceKind" AS ENUM ('TRANSCRIPT_TEXT', 'CATALOG_OUTCOME', 'ADMIN_NOTE');

-- CreateEnum
CREATE TYPE "public"."ReportFormat" AS ENUM ('ADMIN', 'STUDENT');

-- CreateEnum
CREATE TYPE "public"."MappingPlanStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "public"."CourseDecisionStatus" AS ENUM ('UNREVIEWED', 'MAPPED', 'NO_CREDIT', 'CREDIT_ONLY');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActionHistory" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "affectedType" TEXT,
    "affectedId" TEXT,
    "status" "public"."ActionHistoryStatus" NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Student" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "studentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transcript" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "parserStatus" "public"."ParserStatus" NOT NULL DEFAULT 'PENDING',
    "rawText" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TranscriptFile" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "parserStatus" "public"."ParserStatus" NOT NULL DEFAULT 'PENDING',
    "rawText" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalCourse" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "transcriptFileId" TEXT,
    "termLabel" TEXT,
    "courseCode" TEXT,
    "title" TEXT NOT NULL,
    "credits" DECIMAL(4,2),
    "grade" TEXT,
    "sourceSnippet" TEXT,

    CONSTRAINT "ExternalCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProgramCourse" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creditHours" DECIMAL(4,2),

    CONSTRAINT "ProgramCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProgramOutcome" (
    "id" TEXT NOT NULL,
    "programCourseId" TEXT NOT NULL,
    "outcomeCode" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "ProgramOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MappingDecision" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "externalCourseId" TEXT NOT NULL,
    "programCourseId" TEXT NOT NULL,
    "status" "public"."MappingStatus" NOT NULL DEFAULT 'SUGGESTED',
    "plcCreditsGranted" DECIMAL(4,2),
    "rationale" TEXT NOT NULL,
    "confidence" INTEGER,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "MappingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MappingEvidence" (
    "id" TEXT NOT NULL,
    "mappingDecisionId" TEXT NOT NULL,
    "kind" "public"."EvidenceKind" NOT NULL,
    "pageNumber" INTEGER,
    "snippet" TEXT NOT NULL,
    "sourceRef" TEXT,

    CONSTRAINT "MappingEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "format" "public"."ReportFormat" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MappingPlan" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "selectedProgramId" TEXT,
    "status" "public"."MappingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MappingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MappingPlanJourneyGroup" (
    "id" TEXT NOT NULL,
    "mappingPlanId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MappingPlanJourneyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CourseMappingDecision" (
    "id" TEXT NOT NULL,
    "mappingPlanId" TEXT NOT NULL,
    "externalCourseId" TEXT NOT NULL,
    "status" "public"."CourseDecisionStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "awardedCredits" DECIMAL(4,2),
    "rationale" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseMappingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CourseMappingSelection" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "mappingPlanId" TEXT NOT NULL,
    "programCourseId" TEXT NOT NULL,
    "awardedCredits" DECIMAL(4,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseMappingSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CourseMappingEvidence" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "kind" "public"."EvidenceKind" NOT NULL,
    "pageNumber" INTEGER,
    "snippet" TEXT NOT NULL,
    "sourceRef" TEXT,

    CONSTRAINT "CourseMappingEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MappingPlanJourneyCourse" (
    "id" TEXT NOT NULL,
    "mappingPlanId" TEXT NOT NULL,
    "journeyGroupId" TEXT,
    "programCourseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "termCode" VARCHAR(4),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MappingPlanJourneyCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "ActionHistory_timestamp_idx" ON "public"."ActionHistory"("timestamp");

-- CreateIndex
CREATE INDEX "ActionHistory_actorUserId_timestamp_idx" ON "public"."ActionHistory"("actorUserId", "timestamp");

-- CreateIndex
CREATE INDEX "ActionHistory_area_timestamp_idx" ON "public"."ActionHistory"("area", "timestamp");

-- CreateIndex
CREATE INDEX "ActionHistory_actionType_timestamp_idx" ON "public"."ActionHistory"("actionType", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_key" ON "public"."Institution"("name");

-- CreateIndex
CREATE INDEX "Student_lastName_firstName_idx" ON "public"."Student"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Transcript_uploadedAt_idx" ON "public"."Transcript"("uploadedAt");

-- CreateIndex
CREATE INDEX "TranscriptFile_transcriptId_uploadedAt_idx" ON "public"."TranscriptFile"("transcriptId", "uploadedAt");

-- CreateIndex
CREATE INDEX "ExternalCourse_courseCode_title_idx" ON "public"."ExternalCourse"("courseCode", "title");

-- CreateIndex
CREATE INDEX "ExternalCourse_transcriptFileId_idx" ON "public"."ExternalCourse"("transcriptFileId");

-- CreateIndex
CREATE UNIQUE INDEX "Program_name_key" ON "public"."Program"("name");

-- CreateIndex
CREATE INDEX "ProgramCourse_title_idx" ON "public"."ProgramCourse"("title");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCourse_programId_code_key" ON "public"."ProgramCourse"("programId", "code");

-- CreateIndex
CREATE INDEX "MappingDecision_status_idx" ON "public"."MappingDecision"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MappingDecision_externalCourseId_programCourseId_key" ON "public"."MappingDecision"("externalCourseId", "programCourseId");

-- CreateIndex
CREATE INDEX "Report_generatedAt_idx" ON "public"."Report"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MappingPlan_transcriptId_key" ON "public"."MappingPlan"("transcriptId");

-- CreateIndex
CREATE INDEX "MappingPlanJourneyGroup_mappingPlanId_sortOrder_idx" ON "public"."MappingPlanJourneyGroup"("mappingPlanId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMappingDecision_externalCourseId_key" ON "public"."CourseMappingDecision"("externalCourseId");

-- CreateIndex
CREATE INDEX "CourseMappingDecision_mappingPlanId_status_idx" ON "public"."CourseMappingDecision"("mappingPlanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMappingSelection_decisionId_programCourseId_key" ON "public"."CourseMappingSelection"("decisionId", "programCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMappingSelection_mappingPlanId_programCourseId_key" ON "public"."CourseMappingSelection"("mappingPlanId", "programCourseId");

-- CreateIndex
CREATE INDEX "MappingPlanJourneyCourse_journeyGroupId_sortOrder_idx" ON "public"."MappingPlanJourneyCourse"("journeyGroupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MappingPlanJourneyCourse_mappingPlanId_programCourseId_key" ON "public"."MappingPlanJourneyCourse"("mappingPlanId", "programCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "public"."Session"("sessionToken");

-- AddForeignKey
ALTER TABLE "public"."ActionHistory" ADD CONSTRAINT "ActionHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transcript" ADD CONSTRAINT "Transcript_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transcript" ADD CONSTRAINT "Transcript_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "public"."Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranscriptFile" ADD CONSTRAINT "TranscriptFile_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "public"."Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalCourse" ADD CONSTRAINT "ExternalCourse_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "public"."Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalCourse" ADD CONSTRAINT "ExternalCourse_transcriptFileId_fkey" FOREIGN KEY ("transcriptFileId") REFERENCES "public"."TranscriptFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgramCourse" ADD CONSTRAINT "ProgramCourse_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgramOutcome" ADD CONSTRAINT "ProgramOutcome_programCourseId_fkey" FOREIGN KEY ("programCourseId") REFERENCES "public"."ProgramCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingDecision" ADD CONSTRAINT "MappingDecision_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "public"."Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingDecision" ADD CONSTRAINT "MappingDecision_externalCourseId_fkey" FOREIGN KEY ("externalCourseId") REFERENCES "public"."ExternalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingDecision" ADD CONSTRAINT "MappingDecision_programCourseId_fkey" FOREIGN KEY ("programCourseId") REFERENCES "public"."ProgramCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingDecision" ADD CONSTRAINT "MappingDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingEvidence" ADD CONSTRAINT "MappingEvidence_mappingDecisionId_fkey" FOREIGN KEY ("mappingDecisionId") REFERENCES "public"."MappingDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "public"."Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlan" ADD CONSTRAINT "MappingPlan_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "public"."Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlan" ADD CONSTRAINT "MappingPlan_selectedProgramId_fkey" FOREIGN KEY ("selectedProgramId") REFERENCES "public"."Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlan" ADD CONSTRAINT "MappingPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlanJourneyGroup" ADD CONSTRAINT "MappingPlanJourneyGroup_mappingPlanId_fkey" FOREIGN KEY ("mappingPlanId") REFERENCES "public"."MappingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlanJourneyGroup" ADD CONSTRAINT "MappingPlanJourneyGroup_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMappingDecision" ADD CONSTRAINT "CourseMappingDecision_mappingPlanId_fkey" FOREIGN KEY ("mappingPlanId") REFERENCES "public"."MappingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMappingDecision" ADD CONSTRAINT "CourseMappingDecision_externalCourseId_fkey" FOREIGN KEY ("externalCourseId") REFERENCES "public"."ExternalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMappingDecision" ADD CONSTRAINT "CourseMappingDecision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMappingSelection" ADD CONSTRAINT "CourseMappingSelection_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "public"."CourseMappingDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMappingSelection" ADD CONSTRAINT "CourseMappingSelection_mappingPlanId_fkey" FOREIGN KEY ("mappingPlanId") REFERENCES "public"."MappingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMappingSelection" ADD CONSTRAINT "CourseMappingSelection_programCourseId_fkey" FOREIGN KEY ("programCourseId") REFERENCES "public"."ProgramCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseMappingEvidence" ADD CONSTRAINT "CourseMappingEvidence_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "public"."CourseMappingDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlanJourneyCourse" ADD CONSTRAINT "MappingPlanJourneyCourse_mappingPlanId_fkey" FOREIGN KEY ("mappingPlanId") REFERENCES "public"."MappingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlanJourneyCourse" ADD CONSTRAINT "MappingPlanJourneyCourse_journeyGroupId_fkey" FOREIGN KEY ("journeyGroupId") REFERENCES "public"."MappingPlanJourneyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlanJourneyCourse" ADD CONSTRAINT "MappingPlanJourneyCourse_programCourseId_fkey" FOREIGN KEY ("programCourseId") REFERENCES "public"."ProgramCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MappingPlanJourneyCourse" ADD CONSTRAINT "MappingPlanJourneyCourse_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
