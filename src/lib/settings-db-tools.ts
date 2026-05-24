import { ActionHistoryStatus } from "@prisma/client";

import { recordActionHistory } from "@/lib/action-history";
import { db } from "@/lib/db";

export const SETTINGS_PORTAL_TABLES = [
  "transcripts",
  "transcriptFiles",
  "externalCourses",
  "mappingPlans",
  "reports",
  "users",
  "actionHistory",
] as const;

export type SettingsPortalTable = (typeof SETTINGS_PORTAL_TABLES)[number];

export const SETTINGS_PORTAL_PAGE_SIZES = [10, 25, 50] as const;
export type SettingsPortalPageSize = (typeof SETTINGS_PORTAL_PAGE_SIZES)[number];

export const SETTINGS_PORTAL_SORTS = ["default", "asc", "desc"] as const;
export type SettingsPortalSort = (typeof SETTINGS_PORTAL_SORTS)[number];

export type SettingsPortalIssue = "invalid_table" | "invalid_page" | "invalid_page_size" | "invalid_sort";

export type SettingsPortalQueryInput = {
  table?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  filter?: string;
};

export type NormalizedSettingsPortalQuery = {
  table: SettingsPortalTable;
  page: number;
  pageSize: SettingsPortalPageSize;
  sort: SettingsPortalSort;
  filter: string;
  issues: SettingsPortalIssue[];
};

export type SettingsPortalColumn = {
  key: string;
  label: string;
};

export type SettingsPortalRow = {
  id: string;
  cells: Record<string, string>;
  hiddenDetails: Array<{
    label: string;
    value: string;
  }>;
};

export type SettingsPortalData = {
  table: SettingsPortalTable;
  title: string;
  description: string;
  columns: SettingsPortalColumn[];
  rows: SettingsPortalRow[];
  totalRows: number;
  totalPages: number;
  page: number;
  pageSize: SettingsPortalPageSize;
};

type ActorIdentity = {
  id?: string | null;
  email?: string | null;
};

type PortalPresentationOptions = {
  sort: SettingsPortalSort;
  filter: string;
};

const DEFAULT_TABLE: SettingsPortalTable = "transcripts";
const DEFAULT_PAGE_SIZE: SettingsPortalPageSize = 25;
const DEFAULT_SORT: SettingsPortalSort = "default";
const CELL_MAX_LENGTH = 120;
const HIDDEN_MAX_LENGTH = 320;

const TABLE_META: Record<SettingsPortalTable, { title: string; description: string }> = {
  transcripts: {
    title: "Transcripts",
    description: "Transcript records.",
  },
  transcriptFiles: {
    title: "Transcript Files",
    description: "Stored transcript file versions linked to transcript records.",
  },
  externalCourses: {
    title: "External Courses",
    description: "Extracted source courses parsed from transcript documents.",
  },
  mappingPlans: {
    title: "Mapping Plans",
    description: "Per-transcript mapping plans and approval status.",
  },
  reports: {
    title: "Reports",
    description: "Generated report artifacts and metadata.",
  },
  users: {
    title: "Users",
    description: "Admin user accounts and update activity.",
  },
  actionHistory: {
    title: "Action History",
    description: "Audited action events across the workspace.",
  },
};

function isSettingsPortalTable(value: string): value is SettingsPortalTable {
  return SETTINGS_PORTAL_TABLES.includes(value as SettingsPortalTable);
}

function isSettingsPortalPageSize(value: number): value is SettingsPortalPageSize {
  return SETTINGS_PORTAL_PAGE_SIZES.includes(value as SettingsPortalPageSize);
}

function isSettingsPortalSort(value: string): value is SettingsPortalSort {
  return SETTINGS_PORTAL_SORTS.includes(value as SettingsPortalSort);
}

function parsePositiveInteger(value: string | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (nested instanceof Date) {
        return nested.toISOString();
      }
      if (typeof nested === "bigint") {
        return nested.toString();
      }
      return nested;
    });
  } catch {
    return "[unserializable]";
  }
}

export function truncateForPortal(value: unknown, maxLength = CELL_MAX_LENGTH): string {
  if (value == null) {
    return "";
  }

  let text = "";
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    text = String(value);
  } else if (
    typeof value === "object" &&
    value &&
    "toString" in value &&
    typeof value.toString === "function" &&
    value.constructor !== Object &&
    !Array.isArray(value)
  ) {
    text = value.toString();
  } else {
    text = stableStringify(value);
  }

  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function detail(label: string, value: unknown) {
  return {
    label,
    value: truncateForPortal(value, HIDDEN_MAX_LENGTH),
  };
}

function rowSortBlob(row: SettingsPortalRow) {
  return Object.values(row.cells)
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

function rowSearchBlob(row: SettingsPortalRow) {
  const cellText = Object.values(row.cells);
  const hiddenText = row.hiddenDetails.map((entry) => entry.value);
  return `${cellText.join(" ")} ${hiddenText.join(" ")}`.toLowerCase();
}

function applyPresentation(args: {
  rows: SettingsPortalRow[];
  filter: string;
  sort: SettingsPortalSort;
}) {
  let rows = args.rows;
  const filterText = args.filter.trim().toLowerCase();
  if (filterText.length > 0) {
    rows = rows.filter((row) => rowSearchBlob(row).includes(filterText));
  }

  if (args.sort === "default") {
    return rows;
  }

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  const sorted = [...rows].sort((left, right) => collator.compare(rowSortBlob(left), rowSortBlob(right)));
  return args.sort === "asc" ? sorted : sorted.reverse();
}

function buildPortalResult(args: {
  table: SettingsPortalTable;
  page: number;
  pageSize: SettingsPortalPageSize;
  totalRows: number;
  columns: SettingsPortalColumn[];
  rows: SettingsPortalRow[];
  filter?: string;
  sort?: SettingsPortalSort;
}): SettingsPortalData {
  const totalPages = Math.max(1, Math.ceil(args.totalRows / args.pageSize));
  const rows = applyPresentation({
    rows: args.rows,
    filter: args.filter ?? "",
    sort: args.sort ?? DEFAULT_SORT,
  });

  return {
    table: args.table,
    title: TABLE_META[args.table].title,
    description: TABLE_META[args.table].description,
    columns: args.columns,
    rows,
    totalRows: args.totalRows,
    totalPages,
    page: Math.min(args.page, totalPages),
    pageSize: args.pageSize,
  };
}

function issueSummary(issues: SettingsPortalIssue[]) {
  return issues
    .map((issue) => {
      if (issue === "invalid_table") {
        return "table";
      }
      if (issue === "invalid_page") {
        return "page";
      }
      if (issue === "invalid_sort") {
        return "sort";
      }
      return "pageSize";
    })
    .join(", ");
}

export async function recordSettingsPortalIssues(args: {
  actor: ActorIdentity;
  issues: SettingsPortalIssue[];
  rawQuery: SettingsPortalQueryInput;
  normalized: NormalizedSettingsPortalQuery;
}) {
  if (args.issues.length === 0) {
    return;
  }

  await recordActionHistory({
    actor: args.actor,
    actionType: "settings_db_portal_invalid_query",
    description: "Database portal query parameters were normalized due to invalid values.",
    area: "settings",
    affectedType: "database_portal",
    status: ActionHistoryStatus.WARNING,
    metadata: {
      invalidFields: issueSummary(args.issues),
      rawTable: args.rawQuery.table ?? null,
      rawPage: args.rawQuery.page ?? null,
      rawPageSize: args.rawQuery.pageSize ?? null,
      rawSort: args.rawQuery.sort ?? null,
      rawFilter: args.rawQuery.filter ?? null,
      normalizedTable: args.normalized.table,
      normalizedPage: args.normalized.page,
      normalizedPageSize: args.normalized.pageSize,
      normalizedSort: args.normalized.sort,
      normalizedFilter: args.normalized.filter,
    },
  });
}

export function normalizeSettingsPortalQuery(input: SettingsPortalQueryInput): NormalizedSettingsPortalQuery {
  const issues: SettingsPortalIssue[] = [];

  const requestedTable = input.table?.trim();
  const table = requestedTable && isSettingsPortalTable(requestedTable) ? requestedTable : DEFAULT_TABLE;
  if (requestedTable && !isSettingsPortalTable(requestedTable)) {
    issues.push("invalid_table");
  }

  const rawPage = parsePositiveInteger(input.page);
  const page = rawPage ?? 1;
  if (input.page !== undefined && rawPage == null) {
    issues.push("invalid_page");
  }

  const rawPageSize = parsePositiveInteger(input.pageSize);
  const pageSize = rawPageSize && isSettingsPortalPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE;
  if (input.pageSize !== undefined && (rawPageSize == null || !isSettingsPortalPageSize(rawPageSize))) {
    issues.push("invalid_page_size");
  }

  const requestedSort = input.sort?.trim().toLowerCase();
  const sort = requestedSort && isSettingsPortalSort(requestedSort) ? requestedSort : DEFAULT_SORT;
  if (requestedSort && !isSettingsPortalSort(requestedSort)) {
    issues.push("invalid_sort");
  }

  const filter = (input.filter ?? "").trim().slice(0, 120);

  return { table, page, pageSize, sort, filter, issues };
}

export type BeekeeperConnectionInfo = {
  protocol: string;
  host: string;
  port: string;
  database: string;
  username: string;
  sslMode: string;
};

function isWindowsAbsolutePath(value: string) {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function isUncPath(value: string) {
  return /^\\\\[^\\]+\\[^\\]+/.test(value);
}

function isLikelyUri(value: string) {
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function encodePathSegments(path: string) {
  return path
    .split("/")
    .map((segment, index) => {
      if (index === 0 && /^[a-zA-Z]:$/.test(segment)) {
        return segment;
      }
      return encodeURIComponent(segment);
    })
    .join("/");
}

function toFileUriFromWindowsPath(pathValue: string) {
  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+/g, "/");
  const encoded = encodePathSegments(normalized);
  return `file:///${encoded}`;
}

function toFileUriFromUncPath(pathValue: string) {
  const withoutPrefix = pathValue.replace(/^\\\\/, "");
  const normalized = withoutPrefix.replace(/\\/g, "/");
  const [host, ...pathSegments] = normalized.split("/");
  if (!host || pathSegments.length === 0) {
    return null;
  }
  const encodedPath = encodePathSegments(pathSegments.join("/"));
  return `file://${host}/${encodedPath}`;
}

export function normalizeBeekeeperLaunchUrl(input: string | undefined) {
  const value = input?.trim();
  if (!value) {
    return undefined;
  }

  if (isLikelyUri(value)) {
    return value;
  }

  if (isWindowsAbsolutePath(value)) {
    return toFileUriFromWindowsPath(value);
  }

  if (isUncPath(value)) {
    return toFileUriFromUncPath(value) ?? undefined;
  }

  return value;
}

function defaultPortForProtocol(protocol: string) {
  if (protocol === "postgresql" || protocol === "postgres") {
    return "5432";
  }
  if (protocol === "mysql") {
    return "3306";
  }
  return "";
}

function decodeBase64UrlToObject(input: string) {
  try {
    const decoded = Buffer.from(input, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function decodePrismaPostgresDatabaseUrl(parsedUrl: URL) {
  const apiKey = parsedUrl.searchParams.get("api_key");
  if (!apiKey) {
    return null;
  }

  const tokenParts = apiKey.split(".");
  if (tokenParts.length === 3 && tokenParts[1]) {
    const jwtPayload = decodeBase64UrlToObject(tokenParts[1]);
    if (typeof jwtPayload?.databaseUrl === "string") {
      return jwtPayload.databaseUrl;
    }
  }

  const directPayload = decodeBase64UrlToObject(apiKey);
  if (typeof directPayload?.databaseUrl === "string") {
    return directPayload.databaseUrl;
  }

  return null;
}

function parseConnectionInfoFromUrl(parsed: URL, allowPrismaDecode: boolean): BeekeeperConnectionInfo {
  const protocol = parsed.protocol.replace(":", "").toLowerCase();

  if (allowPrismaDecode && protocol === "prisma+postgres") {
    const nestedUrl = decodePrismaPostgresDatabaseUrl(parsed);
    if (nestedUrl) {
      try {
        return parseConnectionInfoFromUrl(new URL(nestedUrl), false);
      } catch {
        // Fall through to a best-effort parse of the outer URL.
      }
    }
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")) || "(none)";
  const username = decodeURIComponent(parsed.username || "");
  const sslModeParam = parsed.searchParams.get("sslmode");
  const sslFlag = parsed.searchParams.get("ssl");
  const sslMode =
    sslModeParam ?? (sslFlag === "true" ? "require" : sslFlag === "false" ? "disable" : "preferred/driver-default");

  return {
    protocol,
    host: parsed.hostname || "(unknown)",
    port: parsed.port || defaultPortForProtocol(protocol) || "(default)",
    database,
    username: username || "(none)",
    sslMode,
  };
}

export function parseDatabaseConnectionInfo(databaseUrl: string | undefined): BeekeeperConnectionInfo | null {
  if (!databaseUrl) {
    return null;
  }

  try {
    return parseConnectionInfoFromUrl(new URL(databaseUrl), true);
  } catch {
    return null;
  }
}

async function loadTranscripts(
  table: SettingsPortalTable,
  page: number,
  pageSize: SettingsPortalPageSize,
  presentation: PortalPresentationOptions,
) {
  const [totalRows, rows] = await Promise.all([
    db.transcript.count(),
    db.transcript.findMany({
      orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fileName: true,
        parserStatus: true,
        uploadedAt: true,
        fileUrl: true,
        rawText: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            studentRef: true,
          },
        },
        institution: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return buildPortalResult({
    table,
    page,
    pageSize,
    totalRows,
    columns: [
      { key: "id", label: "ID" },
      { key: "student", label: "Student" },
      { key: "institution", label: "Institution" },
      { key: "fileName", label: "File" },
      { key: "parserStatus", label: "Parser" },
      { key: "uploadedAt", label: "Uploaded" },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        id: truncateForPortal(row.id),
        student: `${row.student.lastName}, ${row.student.firstName}`,
        institution: truncateForPortal(row.institution.name),
        fileName: truncateForPortal(row.fileName),
        parserStatus: row.parserStatus,
        uploadedAt: truncateForPortal(row.uploadedAt),
      },
      hiddenDetails: [
        detail("studentRef", row.student.studentRef),
        detail("fileUrl", row.fileUrl),
        detail("rawTextPreview", row.rawText),
      ],
    })),
    filter: presentation.filter,
    sort: presentation.sort,
  });
}

async function loadTranscriptFiles(
  table: SettingsPortalTable,
  page: number,
  pageSize: SettingsPortalPageSize,
  presentation: PortalPresentationOptions,
) {
  const [totalRows, rows] = await Promise.all([
    db.transcriptFile.count(),
    db.transcriptFile.findMany({
      orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        transcriptId: true,
        fileName: true,
        parserStatus: true,
        uploadedAt: true,
        fileUrl: true,
        rawText: true,
      },
    }),
  ]);

  return buildPortalResult({
    table,
    page,
    pageSize,
    totalRows,
    columns: [
      { key: "id", label: "ID" },
      { key: "transcriptId", label: "Transcript ID" },
      { key: "fileName", label: "File" },
      { key: "parserStatus", label: "Parser" },
      { key: "uploadedAt", label: "Uploaded" },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        id: truncateForPortal(row.id),
        transcriptId: truncateForPortal(row.transcriptId),
        fileName: truncateForPortal(row.fileName),
        parserStatus: row.parserStatus,
        uploadedAt: truncateForPortal(row.uploadedAt),
      },
      hiddenDetails: [detail("fileUrl", row.fileUrl), detail("rawTextPreview", row.rawText)],
    })),
    filter: presentation.filter,
    sort: presentation.sort,
  });
}

async function loadExternalCourses(
  table: SettingsPortalTable,
  page: number,
  pageSize: SettingsPortalPageSize,
  presentation: PortalPresentationOptions,
) {
  const [totalRows, rows] = await Promise.all([
    db.externalCourse.count(),
    db.externalCourse.findMany({
      orderBy: [{ transcriptId: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        transcriptId: true,
        transcriptFileId: true,
        courseCode: true,
        title: true,
        credits: true,
        grade: true,
        termLabel: true,
        sourceSnippet: true,
      },
    }),
  ]);

  return buildPortalResult({
    table,
    page,
    pageSize,
    totalRows,
    columns: [
      { key: "id", label: "ID" },
      { key: "transcriptId", label: "Transcript ID" },
      { key: "courseCode", label: "Course Code" },
      { key: "title", label: "Title" },
      { key: "credits", label: "Credits" },
      { key: "grade", label: "Grade" },
      { key: "termLabel", label: "Term" },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        id: truncateForPortal(row.id),
        transcriptId: truncateForPortal(row.transcriptId),
        courseCode: truncateForPortal(row.courseCode),
        title: truncateForPortal(row.title),
        credits: row.credits?.toString() ?? "",
        grade: truncateForPortal(row.grade),
        termLabel: truncateForPortal(row.termLabel),
      },
      hiddenDetails: [
        detail("transcriptFileId", row.transcriptFileId),
        detail("sourceSnippet", row.sourceSnippet),
      ],
    })),
    filter: presentation.filter,
    sort: presentation.sort,
  });
}

async function loadMappingPlans(
  table: SettingsPortalTable,
  page: number,
  pageSize: SettingsPortalPageSize,
  presentation: PortalPresentationOptions,
) {
  const [totalRows, rows] = await Promise.all([
    db.mappingPlan.count(),
    db.mappingPlan.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        transcriptId: true,
        selectedProgramId: true,
        status: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
        approvedBy: {
          select: {
            email: true,
          },
        },
        _count: {
          select: {
            decisions: true,
            selections: true,
            journeyCourses: true,
          },
        },
      },
    }),
  ]);

  return buildPortalResult({
    table,
    page,
    pageSize,
    totalRows,
    columns: [
      { key: "id", label: "ID" },
      { key: "transcriptId", label: "Transcript ID" },
      { key: "status", label: "Status" },
      { key: "approvedBy", label: "Approved By" },
      { key: "updatedAt", label: "Updated" },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        id: truncateForPortal(row.id),
        transcriptId: truncateForPortal(row.transcriptId),
        status: row.status,
        approvedBy: truncateForPortal(row.approvedBy?.email),
        updatedAt: truncateForPortal(row.updatedAt),
      },
      hiddenDetails: [
        detail("selectedProgramId", row.selectedProgramId),
        detail("approvedAt", row.approvedAt),
        detail("createdAt", row.createdAt),
        detail("decisionCount", row._count.decisions),
        detail("selectionCount", row._count.selections),
        detail("journeyCourseCount", row._count.journeyCourses),
      ],
    })),
    filter: presentation.filter,
    sort: presentation.sort,
  });
}

async function loadReports(
  table: SettingsPortalTable,
  page: number,
  pageSize: SettingsPortalPageSize,
  presentation: PortalPresentationOptions,
) {
  const [totalRows, rows] = await Promise.all([
    db.report.count(),
    db.report.findMany({
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        transcriptId: true,
        format: true,
        fileUrl: true,
        generatedAt: true,
        generatedBy: {
          select: {
            email: true,
          },
        },
      },
    }),
  ]);

  return buildPortalResult({
    table,
    page,
    pageSize,
    totalRows,
    columns: [
      { key: "id", label: "ID" },
      { key: "transcriptId", label: "Transcript ID" },
      { key: "format", label: "Format" },
      { key: "generatedBy", label: "Generated By" },
      { key: "generatedAt", label: "Generated" },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        id: truncateForPortal(row.id),
        transcriptId: truncateForPortal(row.transcriptId),
        format: row.format,
        generatedBy: truncateForPortal(row.generatedBy.email),
        generatedAt: truncateForPortal(row.generatedAt),
      },
      hiddenDetails: [detail("fileUrl", row.fileUrl)],
    })),
    filter: presentation.filter,
    sort: presentation.sort,
  });
}

async function loadUsers(
  table: SettingsPortalTable,
  page: number,
  pageSize: SettingsPortalPageSize,
  presentation: PortalPresentationOptions,
) {
  const [totalRows, rows] = await Promise.all([
    db.user.count(),
    db.user.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        _count: {
          select: {
            actionHistory: true,
          },
        },
      },
    }),
  ]);

  return buildPortalResult({
    table,
    page,
    pageSize,
    totalRows,
    columns: [
      { key: "id", label: "ID" },
      { key: "email", label: "Email" },
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      { key: "updatedAt", label: "Updated" },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        id: truncateForPortal(row.id),
        email: truncateForPortal(row.email),
        name: truncateForPortal(row.name),
        role: row.role,
        updatedAt: truncateForPortal(row.updatedAt),
      },
      hiddenDetails: [
        detail("createdAt", row.createdAt),
        detail("actionHistoryCount", row._count.actionHistory),
        detail("passwordHash", row.passwordHash ? "[redacted]" : null),
      ],
    })),
    filter: presentation.filter,
    sort: presentation.sort,
  });
}

function compactMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const entries = Object.entries(metadata)
    .filter(([, value]) => value != null && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${truncateForPortal(value, 70)}`);

  return entries.join(" | ");
}

async function loadActionHistory(
  table: SettingsPortalTable,
  page: number,
  pageSize: SettingsPortalPageSize,
  presentation: PortalPresentationOptions,
) {
  const [totalRows, rows] = await Promise.all([
    db.actionHistory.count(),
    db.actionHistory.findMany({
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        timestamp: true,
        status: true,
        actionType: true,
        area: true,
        actorEmail: true,
        description: true,
        affectedType: true,
        affectedId: true,
        metadata: true,
      },
    }),
  ]);

  return buildPortalResult({
    table,
    page,
    pageSize,
    totalRows,
    columns: [
      { key: "timestamp", label: "Timestamp" },
      { key: "status", label: "Status" },
      { key: "actionType", label: "Action" },
      { key: "area", label: "Area" },
      { key: "actorEmail", label: "Actor" },
      { key: "description", label: "Description" },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        timestamp: truncateForPortal(row.timestamp),
        status: row.status,
        actionType: truncateForPortal(row.actionType),
        area: truncateForPortal(row.area),
        actorEmail: truncateForPortal(row.actorEmail),
        description: truncateForPortal(row.description),
      },
      hiddenDetails: [
        detail("affectedType", row.affectedType),
        detail("affectedId", row.affectedId),
        detail("metadata", compactMetadata(row.metadata)),
      ],
    })),
    filter: presentation.filter,
    sort: presentation.sort,
  });
}

function emptyPortal(args: {
  table: SettingsPortalTable;
  page: number;
  pageSize: SettingsPortalPageSize;
  filter: string;
  sort: SettingsPortalSort;
}): SettingsPortalData {
  return buildPortalResult({
    table: args.table,
    page: args.page,
    pageSize: args.pageSize,
    totalRows: 0,
    columns: [],
    rows: [],
    filter: args.filter,
    sort: args.sort,
  });
}

export async function loadSettingsPortalData(args: {
  table: SettingsPortalTable;
  page: number;
  pageSize: SettingsPortalPageSize;
  sort: SettingsPortalSort;
  filter: string;
  actor?: ActorIdentity;
}) {
  const clampedPage = Math.max(1, args.page);
  const presentation: PortalPresentationOptions = {
    filter: args.filter,
    sort: args.sort,
  };

  try {
    const loaded = await (async () => {
      if (args.table === "transcripts") {
        return loadTranscripts(args.table, clampedPage, args.pageSize, presentation);
      }
      if (args.table === "transcriptFiles") {
        return loadTranscriptFiles(args.table, clampedPage, args.pageSize, presentation);
      }
      if (args.table === "externalCourses") {
        return loadExternalCourses(args.table, clampedPage, args.pageSize, presentation);
      }
      if (args.table === "mappingPlans") {
        return loadMappingPlans(args.table, clampedPage, args.pageSize, presentation);
      }
      if (args.table === "reports") {
        return loadReports(args.table, clampedPage, args.pageSize, presentation);
      }
      if (args.table === "users") {
        return loadUsers(args.table, clampedPage, args.pageSize, presentation);
      }
      return loadActionHistory(args.table, clampedPage, args.pageSize, presentation);
    })();

    if (clampedPage > loaded.totalPages) {
      return await loadSettingsPortalData({
        table: args.table,
        page: loaded.totalPages,
        pageSize: args.pageSize,
        sort: args.sort,
        filter: args.filter,
        actor: args.actor,
      });
    }

    return {
      portal: loaded,
      failed: false,
    };
  } catch (error) {
    if (args.actor) {
      await recordActionHistory({
        actor: args.actor,
        actionType: "settings_db_portal_load_failed",
        description: "Database portal data could not be loaded.",
        area: "settings",
        affectedType: "database_portal",
        status: ActionHistoryStatus.ERROR,
        metadata: {
          table: args.table,
          page: clampedPage,
          pageSize: args.pageSize,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
      });
    }

    return {
      portal: emptyPortal({
        table: args.table,
        page: clampedPage,
        pageSize: args.pageSize,
        sort: args.sort,
        filter: args.filter,
      }),
      failed: true,
    };
  }
}
