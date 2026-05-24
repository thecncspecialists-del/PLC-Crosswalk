import { ActionHistoryStatus, Prisma } from "@prisma/client";

import { appLogger } from "@/lib/app-logger";
import { db } from "@/lib/db";

const MAX_METADATA_DEPTH = 3;
const MAX_STRING_LENGTH = 240;
const SENSITIVE_KEY_PATTERN = /password|secret|token|rawtext|content|transcripttext|reporttext/i;

type HistoryActor = {
  id?: string | null;
  email?: string | null;
};

export type ActionHistoryInput = {
  actor?: HistoryActor | null;
  actionType: string;
  description: string;
  area: string;
  affectedType?: string | null;
  affectedId?: string | null;
  status: ActionHistoryStatus;
  metadata?: Record<string, unknown> | null;
};

function sanitizeValue(value: unknown, depth: number): Prisma.JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (depth > MAX_METADATA_DEPTH) {
    return "[truncated]";
  }

  if (value == null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item): item is Prisma.JsonValue => item !== undefined);
  }

  if (typeof value === "object") {
    const sanitized: Prisma.JsonObject = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = "[redacted]";
        continue;
      }

      const safeNestedValue = sanitizeValue(nestedValue, depth + 1);
      if (safeNestedValue !== undefined) {
        sanitized[key] = safeNestedValue;
      }
    }
    return sanitized;
  }

  return String(value);
}

export function sanitizeActionMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) {
    return undefined;
  }

  const sanitized = sanitizeValue(metadata, 0);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return undefined;
  }

  return sanitized as Prisma.InputJsonObject;
}

export async function recordActionHistory(input: ActionHistoryInput) {
  const metadata = sanitizeActionMetadata(input.metadata);

  try {
    await db.actionHistory.create({
      data: {
        actorUserId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actionType: input.actionType,
        description: input.description,
        area: input.area,
        affectedType: input.affectedType ?? null,
        affectedId: input.affectedId ?? null,
        status: input.status,
        metadata,
      },
    });

    const logMethod = input.status === ActionHistoryStatus.ERROR ? appLogger.error : input.status === ActionHistoryStatus.WARNING ? appLogger.warn : appLogger.info;
    logMethod({
      action: input.actionType,
      area: input.area,
      status: input.status.toLowerCase() as "success" | "warning" | "error",
      message: input.description,
      metadata: {
        affectedType: input.affectedType,
        affectedId: input.affectedId,
        ...metadata,
      },
    });
  } catch (error) {
    appLogger.warn({
      action: "action_history_record_failed",
      area: "settings",
      status: "warning",
      message: "Action history could not be recorded.",
      metadata: {
        actionType: input.actionType,
        affectedType: input.affectedType,
        affectedId: input.affectedId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
  }
}
