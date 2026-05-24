import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/permissions";
import { normalizeBeekeeperLaunchUrl } from "@/lib/settings-db-tools";

export const dynamic = "force-dynamic";

function escapePowerShellSingleQuoted(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function resolveLaunchTarget(input: string) {
  if (!input.toLowerCase().startsWith("file://")) {
    return input;
  }

  try {
    return fileURLToPath(new URL(input));
  } catch {
    return input;
  }
}

function startDetached(filePath: string, args: string[]) {
  const processHandle = spawn(filePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  processHandle.unref();
}

function openLaunchTarget(target: string) {
  if (process.platform === "win32") {
    startDetached("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Start-Process -FilePath ${escapePowerShellSingleQuoted(target)}`,
    ]);
    return true;
  }

  if (process.platform === "darwin") {
    startDetached("open", [target]);
    return true;
  }

  if (process.platform === "linux") {
    startDetached("xdg-open", [target]);
    return true;
  }

  return false;
}

function buildSettingsRedirect(request: NextRequest, status: "opened" | "failed") {
  const origin = new URL(request.url).origin;
  const fallback = new URL("/settings", origin);
  const referer = request.headers.get("referer");

  let destination = fallback;
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (parsed.origin === origin && parsed.pathname === "/settings") {
        destination = parsed;
      }
    } catch {
      destination = fallback;
    }
  }

  destination.searchParams.set("beekeeperLaunch", status);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  await requireAdminUser();

  const configured = process.env.BEEKEEPER_LAUNCH_URL?.trim();
  if (!configured) {
    return buildSettingsRedirect(request, "failed");
  }

  const normalized = normalizeBeekeeperLaunchUrl(configured) ?? configured;
  const launchTarget = resolveLaunchTarget(normalized);

  try {
    const launched = openLaunchTarget(launchTarget);
    return buildSettingsRedirect(request, launched ? "opened" : "failed");
  } catch {
    return buildSettingsRedirect(request, "failed");
  }
}
