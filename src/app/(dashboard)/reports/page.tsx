import Link from "next/link";

import { DeleteReportButton } from "@/components/reports/delete-report-button";
import { DownloadReportButton } from "@/components/reports/download-report-button";
import { QuickGenerateSearch } from "@/components/reports/quick-generate-search";
import { ReportGenerateForm } from "@/components/reports/report-generate-form";
import { BackButton } from "@/components/ui/back-button";
import { db } from "@/lib/db";
import { generateReportAction } from "@/server/actions/report-actions";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const hasSearchQuery = query.length > 0;

  const [reports, transcripts] = await Promise.all([
    db.report.findMany({
      include: {
        transcript: {
          include: {
            student: true,
            institution: true,
          },
        },
      },
      orderBy: { generatedAt: "desc" },
    }),
    hasSearchQuery
      ? db.transcript.findMany({
          where: {
            OR: [
              { id: { contains: query, mode: "insensitive" } },
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
          },
          include: {
            student: true,
            institution: true,
          },
          orderBy: { uploadedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <section className="grid min-w-0 gap-4">
      <BackButton fallbackHref="/transcripts" label="Back" />

      <div className="rounded border border-slate-200 bg-white p-4">
        <h1 className="text-base font-semibold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">Export and download admin/student findings.</p>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Quick Generate</h2>
          <QuickGenerateSearch initialQuery={query} />
        </div>
        <div className="mt-3 max-h-[30rem] overflow-y-auto pr-1">
          <div className="grid gap-2">
            {transcripts.map((transcript) => (
              <div
                key={transcript.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">
                    {transcript.student.lastName}, {transcript.student.firstName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {transcript.institution.name}
                    {transcript.student.studentRef ? ` | ${transcript.student.studentRef}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <ReportGenerateForm transcriptId={transcript.id} format="ADMIN" action={generateReportAction} />
                  <ReportGenerateForm transcriptId={transcript.id} format="STUDENT" action={generateReportAction} />
                  <Link
                    href={`/transcripts/${transcript.id}`}
                    className="inline-flex h-10 items-center rounded border border-slate-300 px-3 text-xs font-semibold"
                  >
                    Review
                  </Link>
                </div>
              </div>
            ))}
            {transcripts.length === 0 ? (
              <p className="text-sm text-slate-500">
                {query ? "No matching transcripts found." : "Enter a search to find students."}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Generated Files</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Format</th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Institution</th>
                <th className="px-3 py-2">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="px-3 py-2">{report.generatedAt.toLocaleString()}</td>
                  <td className="px-3 py-2">{report.format}</td>
                  <td className="px-3 py-2">
                    {report.transcript.student.lastName}, {report.transcript.student.firstName}
                  </td>
                  <td className="px-3 py-2">{report.transcript.institution.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <DownloadReportButton reportId={report.id} />
                      <DeleteReportButton reportId={report.id} />
                    </div>
                  </td>
                </tr>
              ))}
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                    No reports generated yet.
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
