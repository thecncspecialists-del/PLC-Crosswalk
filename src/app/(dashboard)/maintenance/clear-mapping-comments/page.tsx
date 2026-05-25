import Link from "next/link";
import { redirect } from "next/navigation";

import {
  clearMappingComments,
  getMappingCommentCleanupCounts,
  totalMappingCommentCleanupCount,
} from "@/lib/mapping-comment-cleanup";
import { requireAdminUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ClearMappingCommentsPageProps = {
  searchParams: Promise<{
    cleared?: string;
  }>;
};

async function clearMappingCommentsAction() {
  "use server";

  await requireAdminUser();
  await clearMappingComments();
  redirect("/maintenance/clear-mapping-comments?cleared=1");
}

export default async function ClearMappingCommentsPage({ searchParams }: ClearMappingCommentsPageProps) {
  await requireAdminUser();

  const params = await searchParams;
  const counts = await getMappingCommentCleanupCounts();
  const total = totalMappingCommentCleanupCount(counts);
  const hasCleared = params.cleared === "1";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maintenance</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Clear Mapping Comments</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Clears reviewer-facing rationale and evidence comment text while preserving mapping statuses, catalog
            selections, awarded credits, transcripts, and reports.
          </p>
        </div>
        <Link href="/settings" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
          Back to Settings
        </Link>
      </div>

      {hasCleared ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Mapping comments were cleared. Current remaining comment count: {total}.
        </div>
      ) : null}

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-950">Current Comment Counts</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2 text-right">Rows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-2 text-slate-700">Course mapping rationale fields</td>
                <td className="px-3 py-2 text-right font-mono text-slate-900">
                  {counts.courseMappingDecisionRationale}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-700">Course mapping evidence comment rows</td>
                <td className="px-3 py-2 text-right font-mono text-slate-900">
                  {counts.courseMappingEvidenceComments}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-700">Legacy mapping rationale fields</td>
                <td className="px-3 py-2 text-right font-mono text-slate-900">
                  {counts.legacyMappingDecisionRationale}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-700">Legacy mapping evidence comment rows</td>
                <td className="px-3 py-2 text-right font-mono text-slate-900">
                  {counts.legacyMappingEvidenceComments}
                </td>
              </tr>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2 text-slate-900">Total</td>
                <td className="px-3 py-2 text-right font-mono text-slate-950">{total}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <form action={clearMappingCommentsAction} className="mt-4">
          <button
            type="submit"
            disabled={total === 0}
            className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Clear Mapping Comments
          </button>
        </form>
      </section>
    </div>
  );
}
