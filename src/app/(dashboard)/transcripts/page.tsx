import Link from "next/link";
import { CourseDecisionStatus, MappingPlanStatus } from "@prisma/client";

import { DeleteTranscriptButton } from "@/components/transcripts/delete-transcript-button";
import { TranscriptUploadForm } from "@/components/transcripts/transcript-upload-form";
import { db } from "@/lib/db";
import { deleteTranscriptAction, uploadTranscriptAction } from "@/server/actions/transcript-actions";

export const dynamic = "force-dynamic";

type TranscriptsPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function TranscriptsPage({ searchParams }: TranscriptsPageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const transcripts = await db.transcript.findMany({
    where: query
      ? {
          OR: [
            { id: { contains: query, mode: "insensitive" } },
            { fileName: { contains: query, mode: "insensitive" } },
            {
              student: {
                OR: [
                  { firstName: { contains: query, mode: "insensitive" } },
                  { lastName: { contains: query, mode: "insensitive" } },
                  { studentRef: { contains: query, mode: "insensitive" } },
                ],
              },
            },
            { institution: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: {
      student: true,
      institution: true,
      mappingPlan: {
        include: {
          decisions: {
            select: {
              status: true,
            },
          },
        },
      },
    },
    orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
  });

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch">
        <div className="max-w-xl lg:max-w-none">
          <TranscriptUploadForm
            action={uploadTranscriptAction}
            existingRecords={transcripts.map((transcript) => ({
              id: transcript.id,
              firstName: transcript.student.firstName,
              lastName: transcript.student.lastName,
              studentRef: transcript.student.studentRef,
              latestInstitutionName: transcript.institution.name,
            }))}
          />
        </div>
        <div className="rounded border border-slate-200 bg-white p-3 lg:flex lg:h-full lg:flex-col">
          <h2 className="text-sm font-semibold text-slate-900">Platform Walkthrough</h2>
          <p className="mt-1 text-xs text-slate-600">
            Follow the full transcript workflow directly on this page.
          </p>
          <div className="mt-3 h-[480px] overflow-hidden rounded border border-slate-200 lg:min-h-0 lg:flex-1">
            <iframe
              src="https://scribehow.com/embed/Managing_Student_Transcripts__ixYdjdMFQn-gUQIGkflpVA?removeLogo=true&as=video"
              title="Managing Student Transcripts Walkthrough"
              width="100%"
              height="100%"
              className="h-full w-full"
              allow="fullscreen"
              style={{ border: 0 }}
            />
          </div>
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-base font-semibold text-slate-900">Transcript Queue</h1>
          <form className="flex w-full gap-2 sm:w-auto" method="get">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search student, institution, transcript ID..."
              className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm sm:w-80 sm:flex-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              Search
            </button>
          </form>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Institution</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Open</th>
                <th className="px-3 py-2 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transcripts.map((transcript) => {
                const decisionStatuses = transcript.mappingPlan?.decisions.map((decision) => decision.status) ?? [];
                const totalCourses = decisionStatuses.length;
                const decidedCourses = decisionStatuses.filter(
                  (status) =>
                    status === CourseDecisionStatus.MAPPED ||
                    status === CourseDecisionStatus.NO_CREDIT ||
                    status === CourseDecisionStatus.CREDIT_ONLY,
                ).length;
                const planStatus = transcript.mappingPlan?.status ?? MappingPlanStatus.DRAFT;

                return (
                  <tr key={transcript.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">
                        {transcript.student.lastName}, {transcript.student.firstName}
                      </p>
                      <p className="text-xs text-slate-500">{transcript.student.studentRef ?? "No ref"}</p>
                    </td>
                    <td className="px-3 py-2">{transcript.institution.name}</td>
                    <td className="px-3 py-2">{transcript.uploadedAt.toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          planStatus === MappingPlanStatus.APPROVED
                            ? "inline-flex rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                            : "inline-flex rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                        }
                      >
                        {planStatus === MappingPlanStatus.APPROVED ? "Approved" : "Draft"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {totalCourses > 0 ? `${decidedCourses}/${totalCourses}` : "0/0"}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/transcripts/${transcript.id}`} className="text-slate-900 underline">
                        Review
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <DeleteTranscriptButton
                          action={deleteTranscriptAction}
                          studentName={`${transcript.student.firstName} ${transcript.student.lastName}`}
                          transcriptId={transcript.id}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {transcripts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                    No transcripts found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
