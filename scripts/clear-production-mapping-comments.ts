import { PrismaClient } from "@prisma/client";

import {
  clearMappingComments,
  getMappingCommentCleanupCounts,
} from "@/lib/mapping-comment-cleanup";

const PRODUCTION_ORIGIN = "https://plc.thecnc.network";

const prisma = new PrismaClient();

function getOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function assertProductionTarget() {
  const authOrigin = getOrigin(process.env.AUTH_URL) ?? getOrigin(process.env.NEXTAUTH_URL);
  if (authOrigin !== PRODUCTION_ORIGIN) {
    throw new Error(`Refusing to run: AUTH_URL/NEXTAUTH_URL is not ${PRODUCTION_ORIGIN}.`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Refusing to run: DATABASE_URL is missing.");
  }

  const parsedDatabaseUrl = new URL(databaseUrl);
  if (["localhost", "127.0.0.1", "::1"].includes(parsedDatabaseUrl.hostname)) {
    throw new Error("Refusing to run: DATABASE_URL points to a local database.");
  }

  return {
    authOrigin,
    database: {
      protocol: parsedDatabaseUrl.protocol,
      host: parsedDatabaseUrl.hostname,
      port: parsedDatabaseUrl.port || null,
      database: parsedDatabaseUrl.pathname.replace(/^\//, "") || null,
    },
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const target = assertProductionTarget();
  const before = await getMappingCommentCleanupCounts(prisma);
  const changed = apply ? await clearMappingComments(prisma) : null;
  const after = apply ? await getMappingCommentCleanupCounts(prisma) : before;

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        target,
        before,
        changed,
        after,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
