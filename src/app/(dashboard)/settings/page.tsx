import Link from "next/link";

import { auth } from "@/auth";
import { BeekeeperHelper } from "@/components/settings/beekeeper-helper";
import { SettingsCanonicalUrl } from "@/components/settings/settings-canonical-url";
import { SettingsPortalControls } from "@/components/settings/settings-portal-controls";
import {
  buildSettingsPortalHref,
  loadSettingsPortalData,
  normalizeSettingsPortalQuery,
  parseDatabaseConnectionInfo,
  recordSettingsPortalIssues,
  SETTINGS_PORTAL_PAGE_SIZES,
  SETTINGS_PORTAL_TABLES,
  type SettingsPortalTable,
} from "@/lib/settings-db-tools";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{
    table?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    filter?: string;
    beekeeperLaunch?: string;
  }>;
};

const TABLE_LABELS: Record<SettingsPortalTable, string> = {
  transcripts: "Transcripts",
  transcriptFiles: "Transcript Files",
  externalCourses: "External Courses",
  mappingPlans: "Mapping Plans",
  reports: "Reports",
  users: "Users",
  actionHistory: "Action History",
};

function issueMessage(issues: string[]) {
  if (issues.length === 0) {
    return null;
  }
  const labels = issues.map((issue) => {
    if (issue === "invalid_table") {
      return "table";
    }
    if (issue === "invalid_page") {
      return "page";
    }
    if (issue === "invalid_page_size") {
      return "page size";
    }
    if (issue === "invalid_sort") {
      return "sort";
    }
    return issue;
  });
  return `Invalid settings were normalized for: ${labels.join(", ")}.`;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const normalizedPortalQuery = normalizeSettingsPortalQuery({
    table: params.table,
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    filter: params.filter,
  });

  const session = await auth();
  const isDev = process.env.NODE_ENV !== "production";
  const actor = session?.user ? { id: session.user.id, email: session.user.email } : undefined;

  if (actor) {
    await recordSettingsPortalIssues({
      actor,
      issues: normalizedPortalQuery.issues,
      rawQuery: {
        table: params.table,
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort,
        filter: params.filter,
      },
      normalized: normalizedPortalQuery,
    });
  }

  const dbPortal = await loadSettingsPortalData({
    table: normalizedPortalQuery.table,
    page: normalizedPortalQuery.page,
    pageSize: normalizedPortalQuery.pageSize,
    sort: normalizedPortalQuery.sort,
    filter: normalizedPortalQuery.filter,
    actor,
  });
  const dbConnectionInfo = parseDatabaseConnectionInfo(process.env.DATABASE_URL);
  const launchEnabled = Boolean(process.env.BEEKEEPER_LAUNCH_URL?.trim());
  const launchStatus =
    params.beekeeperLaunch === "opened" || params.beekeeperLaunch === "failed" ? params.beekeeperLaunch : null;
  const hasPrevPage = dbPortal.portal.page > 1;
  const hasNextPage = dbPortal.portal.page < dbPortal.portal.totalPages;
  const invalidQueryMessage = issueMessage(normalizedPortalQuery.issues);
  const canonicalSettingsHref = buildSettingsPortalHref({
    table: dbPortal.portal.table,
    page: dbPortal.portal.page,
    pageSize: dbPortal.portal.pageSize,
    sort: normalizedPortalQuery.sort,
    filter: normalizedPortalQuery.filter,
  });
  const shouldCanonicalizeSettingsUrl =
    normalizedPortalQuery.issues.length > 0 || dbPortal.portal.page !== normalizedPortalQuery.page;

  return (
    <section className="grid min-w-0 gap-4">
      <SettingsCanonicalUrl href={canonicalSettingsHref} replace={shouldCanonicalizeSettingsUrl} />

      <div className="rounded border border-slate-200 bg-white p-4">
        <h1 className="text-base font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Admin-level workspace controls and environment details.</p>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Current Session</h2>
        <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Signed In As</dt>
            <dd>{session?.user?.email ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Environment</dt>
            <dd>{isDev ? "Development" : "Production"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Database Tools</h2>
            <p className="mt-1 text-sm text-slate-600">Read-only portal access for operational tables.</p>
          </div>
          <span className="text-xs text-slate-500">Hosted-safe</span>
        </div>

        {invalidQueryMessage ? (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {invalidQueryMessage}
          </p>
        ) : null}
        {dbPortal.failed ? (
          <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Database portal data is temporarily unavailable.
          </p>
        ) : null}

        <div className="mt-3">
          <BeekeeperHelper connectionInfo={dbConnectionInfo} launchEnabled={launchEnabled} launchStatus={launchStatus} />
        </div>

        <div className="mt-4 rounded border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{dbPortal.portal.title}</h3>
              <p className="mt-1 text-xs text-slate-600">{dbPortal.portal.description}</p>
            </div>
            <SettingsPortalControls
              key={`${dbPortal.portal.table}:${dbPortal.portal.pageSize}`}
              table={dbPortal.portal.table}
              pageSize={dbPortal.portal.pageSize}
              sort={normalizedPortalQuery.sort}
              filter={normalizedPortalQuery.filter}
              tableOptions={SETTINGS_PORTAL_TABLES.map((table) => ({
                value: table,
                label: TABLE_LABELS[table],
              }))}
              pageSizeOptions={SETTINGS_PORTAL_PAGE_SIZES}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Rows: {dbPortal.portal.totalRows} | Page {dbPortal.portal.page} of {dbPortal.portal.totalPages}
            </span>
            <div className="flex items-center gap-2">
              {hasPrevPage ? (
                <Link
                  href={buildSettingsPortalHref({
                    table: dbPortal.portal.table,
                    page: dbPortal.portal.page - 1,
                    pageSize: dbPortal.portal.pageSize,
                    sort: normalizedPortalQuery.sort,
                    filter: normalizedPortalQuery.filter,
                  })}
                  className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded border border-slate-200 px-2 py-1 text-slate-400">Previous</span>
              )}
              {hasNextPage ? (
                <Link
                  href={buildSettingsPortalHref({
                    table: dbPortal.portal.table,
                    page: dbPortal.portal.page + 1,
                    pageSize: dbPortal.portal.pageSize,
                    sort: normalizedPortalQuery.sort,
                    filter: normalizedPortalQuery.filter,
                  })}
                  className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded border border-slate-200 px-2 py-1 text-slate-400">Next</span>
              )}
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {dbPortal.portal.columns.map((column) => (
                    <th key={column.key} className="px-3 py-2">
                      {column.label}
                    </th>
                  ))}
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dbPortal.portal.rows.map((row) => {
                  const visibleDetails = row.hiddenDetails.filter((entry) => entry.value.length > 0);
                  return (
                    <tr key={row.id}>
                      {dbPortal.portal.columns.map((column) => (
                        <td key={`${row.id}-${column.key}`} className="px-3 py-2 text-slate-700">
                          {row.cells[column.key]}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {visibleDetails.length > 0 ? (
                          <details>
                            <summary className="cursor-pointer select-none text-slate-700">View</summary>
                            <dl className="mt-2 grid gap-1 rounded border border-slate-200 bg-slate-50 p-2">
                              {visibleDetails.map((entry) => (
                                <div key={`${row.id}-${entry.label}`}>
                                  <dt className="font-semibold text-slate-600">{entry.label}</dt>
                                  <dd className="break-all text-slate-700">{entry.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {dbPortal.portal.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={dbPortal.portal.columns.length + 1}
                      className="px-3 py-8 text-center text-sm text-slate-500"
                    >
                      No rows found for this table.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
