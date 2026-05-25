import type { FullConfig } from "@playwright/test";

type HealthResponse = {
  app?: string;
  database?: string;
  error?: string | null;
  status?: string;
};

function appUpMessage(baseURL: string) {
  return [
    `E2E preflight could not confirm a healthy app at ${baseURL}.`,
    "Run `npm run app:up:dev` and then rerun `npm run test:e2e`.",
  ].join("\n");
}

function databaseMessage(baseURL: string, health: HealthResponse) {
  return [
    `E2E preflight reached ${baseURL}, but the database is not healthy.`,
    `Health response: ${JSON.stringify(health)}`,
    "Run `npm run app:up:dev`; if login still fails after health passes, run `npm run db:seed`.",
  ].join("\n");
}

export async function assertHealthyE2EApp(baseURL: string) {
  let response: Response;
  try {
    response = await fetch(new URL("/api/health", baseURL), {
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new Error(`${appUpMessage(baseURL)}\nCause: ${error instanceof Error ? error.message : "unknown"}`);
  }

  if (!response.ok) {
    throw new Error(`${appUpMessage(baseURL)}\nHealth status: ${response.status}`);
  }

  const health = (await response.json()) as HealthResponse;
  if (health.status !== "ok" || health.app !== "up" || health.database !== "up") {
    throw new Error(databaseMessage(baseURL, health));
  }
}

export default async function globalSetup(config: FullConfig) {
  const configuredBaseURL = config.projects[0]?.use.baseURL;
  const baseURL =
    process.env.E2E_BASE_URL ??
    (typeof configuredBaseURL === "string" ? configuredBaseURL : undefined) ??
    "http://localhost:3000";

  await assertHealthyE2EApp(baseURL);
}
