import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type HealthStatus = "up" | "down";

export async function GET() {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  let dbStatus: HealthStatus = "up";
  let errorCode: string | null = null;

  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "down";
    errorCode = "database_unavailable";
  }

  return NextResponse.json({
    status: dbStatus === "up" ? "ok" : "degraded",
    app: "up" as HealthStatus,
    database: dbStatus,
    timestamp,
    responseTimeMs: Date.now() - startedAt,
    error: errorCode,
  });
}
