import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  ActionHistoryStatus,
  CourseDecisionStatus,
  MappingPlanStatus,
  ParserStatus,
  PrismaClient,
} from "@prisma/client";

const PRODUCTION_URL = "https://plc.thecnc.network";
const DEFAULT_ENV_FILE = ".env.production.local";
const DEFAULT_SOURCE_DIRECTORY = "C:\\Users\\thecn\\Codex_002";

const EXISTING_TRANSCRIPT_FILES = [
  "Cuomo_Transcript.pdf",
  "M. Christion UNOFFICIAL TRANSCRIPT - 4.12.2025.pdf",
  "M. Saulnier Unofficial Transcript - 4.18.2025.pdf",
  "M.Theisen Unofficial Transcript.pdf",
  "P. Zorn Unofficial Transcript_BATES.AJAC.pdf",
  "R. Ameline Unofficial Transcript.pdf",
  "S. Lewis Unofficial Transcript.pdf",
  "W. Schatz Transcript.pdf",
] as const;

const WHATCOM_TRANSCRIPT = {
  fileName: "Transcript_Whatcom_Community_College.pdf",
  studentFirstName: "Christion",
  studentLastName: "Marcus",
  studentRef: "874001056",
  institutionName: "Whatcom Community College",
  courses: [
    {
      termLabel: "Fall 01",
      courseCode: "ABE 030",
      title: "BASIC SKILLS MATH III",
      credits: 1,
      grade: "S",
      sourceSnippet: "Visual import from image-based PDF: ABE 030 BASIC SKILLS MATH III S 1.0",
    },
    {
      termLabel: "Fall 01",
      courseCode: "ABE 031",
      title: "BASIC READNG/WRITING III",
      credits: 1,
      grade: "S",
      sourceSnippet: "Visual import from image-based PDF: ABE 031 BASIC READNG/WRITING III S 1.0",
    },
  ],
};

type Args = {
  apply: boolean;
  envFile: string;
  sourceDirectory: string;
  help: boolean;
};

type TargetReference = {
  bucket: string;
  key: string;
  reference: string;
};

function usage() {
  return [
    "Usage:",
    "  npm run production:repair-transcripts:dry-run",
    "  npm run production:repair-transcripts",
    "",
    "Options:",
    "  --apply                 Upload missing PDFs and create missing Whatcom production record.",
    `  --env <path>            Production env file. Default: ${DEFAULT_ENV_FILE}`,
    `  --source <directory>    Local PDF source directory. Default: ${DEFAULT_SOURCE_DIRECTORY}`,
  ].join("\n");
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    envFile: DEFAULT_ENV_FILE,
    sourceDirectory: DEFAULT_SOURCE_DIRECTORY,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--apply") {
      args.apply = true;
      continue;
    }
    if (current === "--help" || current === "-h") {
      args.help = true;
      continue;
    }
    if (current === "--env") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--env requires a path.");
      }
      args.envFile = value;
      index += 1;
      continue;
    }
    if (current === "--source") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--source requires a directory.");
      }
      args.sourceDirectory = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${current}`);
  }

  return args;
}

function parseEnvValue(rawValue: string) {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  return trimmed;
}

async function loadProductionEnv(envFile: string) {
  const resolved = path.resolve(envFile);
  const contents = await readFile(resolved, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
    process.env[key] = value;
  }

  return resolved;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in ${DEFAULT_ENV_FILE}.`);
  }
  return value;
}

function assertProductionEnvironment() {
  const authUrl = process.env.AUTH_URL?.trim();
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (authUrl !== PRODUCTION_URL && nextAuthUrl !== PRODUCTION_URL) {
    throw new Error(`Refusing to run: AUTH_URL or NEXTAUTH_URL must be ${PRODUCTION_URL}.`);
  }

  const databaseUrl = requireEnv("DATABASE_URL");
  if (/localhost|127\.0\.0\.1|host\.docker\.internal/i.test(databaseUrl)) {
    throw new Error("Refusing to run: DATABASE_URL appears to point at a local database.");
  }

  const storageProvider = requireEnv("STORAGE_PROVIDER").toLowerCase();
  if (storageProvider !== "s3") {
    throw new Error("Refusing to run: STORAGE_PROVIDER must be s3 for production repair.");
  }

  requireEnv("S3_BUCKET");
  requireEnv("S3_REGION");
  requireEnv("S3_ACCESS_KEY_ID");
  requireEnv("S3_SECRET_ACCESS_KEY");
}

function getS3Client() {
  return new S3Client({
    region: requireEnv("S3_REGION"),
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "false").toLowerCase() === "true",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
}

function parseS3Reference(reference: string): TargetReference {
  if (reference.startsWith("s3://")) {
    const withoutPrefix = reference.slice("s3://".length);
    const separatorIndex = withoutPrefix.indexOf("/");
    if (separatorIndex < 1 || separatorIndex === withoutPrefix.length - 1) {
      throw new Error(`Invalid S3 reference: ${reference}`);
    }
    return {
      bucket: withoutPrefix.slice(0, separatorIndex),
      key: withoutPrefix.slice(separatorIndex + 1),
      reference,
    };
  }

  return {
    bucket: requireEnv("S3_BUCKET"),
    key: reference.replace(/^\/+/, ""),
    reference,
  };
}

function safeName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function objectExists(s3: S3Client, target: TargetReference) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: target.bucket, Key: target.key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadObject(s3: S3Client, target: TargetReference, fileName: string, body: Buffer) {
  await s3.send(
    new PutObjectCommand({
      Bucket: target.bucket,
      Key: target.key,
      Body: body,
      ContentType: "application/pdf",
      Metadata: {
        source: "production-transcript-storage-repair",
        fileName,
      },
    }),
  );
}

async function readSourcePdf(sourceDirectory: string, fileName: string) {
  const sourcePath = path.join(sourceDirectory, fileName);
  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile()) {
    throw new Error(`Source PDF is not a file: ${sourcePath}`);
  }
  return {
    sourcePath,
    body: await readFile(sourcePath),
    size: sourceStat.size,
  };
}

async function repairExistingTranscriptFiles(args: {
  apply: boolean;
  db: PrismaClient;
  s3: S3Client;
  sourceDirectory: string;
}) {
  const rows = await args.db.transcriptFile.findMany({
    where: {
      fileName: {
        in: [...EXISTING_TRANSCRIPT_FILES],
      },
    },
    include: {
      transcript: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          institution: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ fileName: "asc" }, { uploadedAt: "desc" }],
  });

  const foundNames = new Set(rows.map((row) => row.fileName));
  const missingProductionRows = EXISTING_TRANSCRIPT_FILES.filter((fileName) => !foundNames.has(fileName));
  const repaired: unknown[] = [];
  const skipped: unknown[] = [];
  const missingObjects: unknown[] = [];

  for (const row of rows) {
    const source = await readSourcePdf(args.sourceDirectory, row.fileName);
    const targetReferences = new Map<string, TargetReference>();
    for (const reference of [row.fileUrl, row.transcript.fileUrl]) {
      const target = parseS3Reference(reference);
      targetReferences.set(`${target.bucket}/${target.key}`, target);
    }

    for (const target of targetReferences.values()) {
      const exists = await objectExists(args.s3, target);
      if (exists) {
        skipped.push({
          reason: "object_exists",
          transcriptId: row.transcriptId,
          transcriptFileId: row.id,
          fileName: row.fileName,
          key: target.key,
        });
        continue;
      }

      missingObjects.push({
        transcriptId: row.transcriptId,
        transcriptFileId: row.id,
        fileName: row.fileName,
        student: `${row.transcript.student.lastName}, ${row.transcript.student.firstName}`,
        institution: row.transcript.institution.name,
        key: target.key,
        sourcePath: source.sourcePath,
        size: source.size,
      });

      if (args.apply) {
        await uploadObject(args.s3, target, row.fileName, source.body);
        repaired.push({
          transcriptId: row.transcriptId,
          transcriptFileId: row.id,
          fileName: row.fileName,
          key: target.key,
          sourcePath: source.sourcePath,
          size: source.size,
        });
      }
    }
  }

  return {
    missingProductionRows,
    missingObjects,
    repaired,
    skipped,
  };
}

async function importWhatcomTranscript(args: {
  apply: boolean;
  db: PrismaClient;
  s3: S3Client;
  sourceDirectory: string;
}) {
  const existing = await args.db.transcript.findFirst({
    where: {
      fileName: WHATCOM_TRANSCRIPT.fileName,
      student: {
        studentRef: WHATCOM_TRANSCRIPT.studentRef,
      },
      institution: {
        name: WHATCOM_TRANSCRIPT.institutionName,
      },
    },
    select: {
      id: true,
      files: {
        select: {
          id: true,
        },
      },
      externalCourses: {
        select: {
          id: true,
        },
      },
    },
  });

  if (existing) {
    return {
      status: "skipped_existing_record",
      transcriptId: existing.id,
      files: existing.files.length,
      courses: existing.externalCourses.length,
      verificationUrl: `${PRODUCTION_URL}/transcripts/${existing.id}`,
    };
  }

  const source = await readSourcePdf(args.sourceDirectory, WHATCOM_TRANSCRIPT.fileName);
  const key = `transcripts/${Date.now()}-${safeName(WHATCOM_TRANSCRIPT.fileName)}`;
  const fileUrl = `s3://${requireEnv("S3_BUCKET")}/${key}`;
  const target = parseS3Reference(fileUrl);

  if (!args.apply) {
    return {
      status: "would_create",
      fileName: WHATCOM_TRANSCRIPT.fileName,
      student: `${WHATCOM_TRANSCRIPT.studentLastName}, ${WHATCOM_TRANSCRIPT.studentFirstName}`,
      studentRef: WHATCOM_TRANSCRIPT.studentRef,
      institution: WHATCOM_TRANSCRIPT.institutionName,
      key,
      sourcePath: source.sourcePath,
      courses: WHATCOM_TRANSCRIPT.courses.length,
    };
  }

  await uploadObject(args.s3, target, WHATCOM_TRANSCRIPT.fileName, source.body);

  const now = new Date();
  const created = await args.db.$transaction(async (tx) => {
    const institution = await tx.institution.upsert({
      where: {
        name: WHATCOM_TRANSCRIPT.institutionName,
      },
      update: {},
      create: {
        name: WHATCOM_TRANSCRIPT.institutionName,
      },
    });

    const student = await tx.student.create({
      data: {
        firstName: WHATCOM_TRANSCRIPT.studentFirstName,
        lastName: WHATCOM_TRANSCRIPT.studentLastName,
        studentRef: WHATCOM_TRANSCRIPT.studentRef,
      },
    });

    const transcript = await tx.transcript.create({
      data: {
        studentId: student.id,
        institutionId: institution.id,
        fileName: WHATCOM_TRANSCRIPT.fileName,
        fileUrl,
        parserStatus: ParserStatus.PARSED,
        rawText: null,
        uploadedAt: now,
      },
    });

    const mappingPlan = await tx.mappingPlan.create({
      data: {
        transcriptId: transcript.id,
        status: MappingPlanStatus.DRAFT,
      },
    });

    const transcriptFile = await tx.transcriptFile.create({
      data: {
        transcriptId: transcript.id,
        fileName: WHATCOM_TRANSCRIPT.fileName,
        fileUrl,
        parserStatus: ParserStatus.PARSED,
        rawText: null,
        uploadedAt: now,
      },
    });

    for (const course of WHATCOM_TRANSCRIPT.courses) {
      const externalCourse = await tx.externalCourse.create({
        data: {
          transcriptId: transcript.id,
          transcriptFileId: transcriptFile.id,
          termLabel: course.termLabel,
          courseCode: course.courseCode,
          title: course.title,
          credits: course.credits,
          grade: course.grade,
          sourceSnippet: course.sourceSnippet,
        },
      });

      await tx.courseMappingDecision.create({
        data: {
          mappingPlanId: mappingPlan.id,
          externalCourseId: externalCourse.id,
          status: CourseDecisionStatus.UNREVIEWED,
        },
      });
    }

    await tx.actionHistory.create({
      data: {
        actorEmail: "production-repair-script",
        actionType: "transcript_upload",
        description: "Imported the Whatcom transcript PDF during production storage repair.",
        area: "transcripts",
        affectedType: "transcript",
        affectedId: transcript.id,
        status: ActionHistoryStatus.SUCCESS,
        metadata: {
          fileName: WHATCOM_TRANSCRIPT.fileName,
          sourcePath: source.sourcePath,
          storageKey: key,
          courses: WHATCOM_TRANSCRIPT.courses.length,
        },
      },
    });

    return {
      transcriptId: transcript.id,
      transcriptFileId: transcriptFile.id,
    };
  });

  return {
    status: "created",
    ...created,
    fileName: WHATCOM_TRANSCRIPT.fileName,
    key,
    sourcePath: source.sourcePath,
    courses: WHATCOM_TRANSCRIPT.courses.length,
    verificationUrl: `${PRODUCTION_URL}/transcripts/${created.transcriptId}`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const loadedEnv = await loadProductionEnv(args.envFile);
  assertProductionEnvironment();

  const db = new PrismaClient();
  const s3 = getS3Client();

  try {
    const existingRepair = await repairExistingTranscriptFiles({
      apply: args.apply,
      db,
      s3,
      sourceDirectory: path.resolve(args.sourceDirectory),
    });
    const whatcom = await importWhatcomTranscript({
      apply: args.apply,
      db,
      s3,
      sourceDirectory: path.resolve(args.sourceDirectory),
    });

    console.log(
      JSON.stringify(
        {
          mode: args.apply ? "apply" : "dry-run",
          productionUrl: PRODUCTION_URL,
          loadedEnv,
          sourceDirectory: path.resolve(args.sourceDirectory),
          existingRepair,
          whatcom,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
