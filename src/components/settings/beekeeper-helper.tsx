import { CopyFieldButton } from "@/components/settings/copy-field-button";
import type { BeekeeperConnectionInfo } from "@/lib/settings-db-tools";

type BeekeeperHelperProps = {
  connectionInfo: BeekeeperConnectionInfo | null;
  launchEnabled: boolean;
  launchStatus?: "opened" | "failed" | null;
};

export function BeekeeperHelper({ connectionInfo, launchEnabled, launchStatus }: BeekeeperHelperProps) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Beekeeper Studio</h3>
        </div>
        {launchEnabled ? (
          <a
            href="/api/settings/open-beekeeper"
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Open Beekeeper
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Set BEEKEEPER_LAUNCH_URL to enable launch"
            className="cursor-not-allowed rounded border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
          >
            Open Beekeeper
          </button>
        )}
      </div>

      {!launchEnabled ? (
        <p className="mt-1 text-xs text-amber-700">
          Launch disabled. Set <code>BEEKEEPER_LAUNCH_URL</code> to enable.
        </p>
      ) : null}
      {launchStatus === "opened" ? (
        <p className="mt-1 text-xs text-emerald-700">Launch request sent.</p>
      ) : null}
      {launchStatus === "failed" ? (
        <p className="mt-1 text-xs text-rose-700">Unable to launch Beekeeper from this environment.</p>
      ) : null}

      {connectionInfo ? (
        <details className="mt-2 rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer select-none text-xs font-semibold text-slate-700">Connection Details</summary>
          <dl className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Protocol</dt>
              <dd className="break-all text-slate-800">{connectionInfo.protocol}</dd>
              <CopyFieldButton value={connectionInfo.protocol} label="Protocol" />
            </div>
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Host</dt>
              <dd className="break-all text-slate-800">{connectionInfo.host}</dd>
              <CopyFieldButton value={connectionInfo.host} label="Host" />
            </div>
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Port</dt>
              <dd className="break-all text-slate-800">{connectionInfo.port}</dd>
              <CopyFieldButton value={connectionInfo.port} label="Port" />
            </div>
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Database</dt>
              <dd className="break-all text-slate-800">{connectionInfo.database}</dd>
              <CopyFieldButton value={connectionInfo.database} label="Database" />
            </div>
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Username</dt>
              <dd className="break-all text-slate-800">{connectionInfo.username}</dd>
              <CopyFieldButton value={connectionInfo.username} label="Username" />
            </div>
            <div>
              <dt className="uppercase tracking-wide text-slate-500">SSL Mode</dt>
              <dd className="break-all text-slate-800">{connectionInfo.sslMode}</dd>
              <CopyFieldButton value={connectionInfo.sslMode} label="SSL mode" />
            </div>
          </dl>
        </details>
      ) : (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Connection details are unavailable because <code>DATABASE_URL</code> is missing or invalid.
        </p>
      )}
    </div>
  );
}
