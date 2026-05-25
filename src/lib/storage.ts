import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { appLogger } from "@/lib/app-logger";

type StorageFolder = "transcripts" | "reports";
type StorageProvider = "inline" | "local" | "s3";

const uploadsRoot = path.join(process.cwd(), "uploads");
const storageProvider = ((process.env.STORAGE_PROVIDER ?? "local").toLowerCase() as StorageProvider) || "local";

const s3Bucket = process.env.S3_BUCKET ?? "";
const s3Region = process.env.S3_REGION ?? "us-east-1";
const s3Endpoint = process.env.S3_ENDPOINT;
const s3ForcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? "false").toLowerCase() === "true";
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

let s3Client: S3Client | null = null;

function safeName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildStoredPath(folder: StorageFolder, fileName: string) {
  const timestamp = Date.now();
  return `${folder}/${timestamp}-${safeName(fileName)}`;
}

function contentTypeForFolder(folder: StorageFolder) {
  return folder === "transcripts" ? "application/pdf" : "text/plain; charset=utf-8";
}

function isS3Reference(reference: string) {
  return reference.startsWith("s3://");
}

function isInlineReference(reference: string) {
  return reference.startsWith("data:");
}

function buildInlineReference(folder: StorageFolder, buffer: Buffer) {
  return `data:${contentTypeForFolder(folder)};base64,${buffer.toString("base64")}`;
}

function readInlineReference(reference: string) {
  const marker = ";base64,";
  const markerIndex = reference.indexOf(marker);
  if (!isInlineReference(reference) || markerIndex < 0) {
    throw new Error("Invalid inline storage reference.");
  }
  return Buffer.from(reference.slice(markerIndex + marker.length), "base64");
}

function parseS3Reference(reference: string) {
  if (!isS3Reference(reference)) {
    if (!s3Bucket) {
      throw new Error(`Cannot resolve S3 storage reference without S3_BUCKET: ${reference}`);
    }
    return {
      bucket: s3Bucket,
      key: reference.replace(/^\/+/, ""),
    };
  }

  const withoutPrefix = reference.slice("s3://".length);
  const separatorIndex = withoutPrefix.indexOf("/");
  if (separatorIndex < 1 || separatorIndex === withoutPrefix.length - 1) {
    throw new Error(`Invalid S3 reference: ${reference}`);
  }

  return {
    bucket: withoutPrefix.slice(0, separatorIndex),
    key: withoutPrefix.slice(separatorIndex + 1),
  };
}

function getS3Client() {
  if (!s3Bucket) {
    throw new Error("S3_BUCKET is required when STORAGE_PROVIDER=s3.");
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: s3Region,
      endpoint: s3Endpoint || undefined,
      forcePathStyle: s3ForcePathStyle,
      credentials:
        s3AccessKeyId && s3SecretAccessKey
          ? {
              accessKeyId: s3AccessKeyId,
              secretAccessKey: s3SecretAccessKey,
            }
          : undefined,
    });
  }

  return s3Client;
}

async function streamToBuffer(streamLike: unknown) {
  if (Buffer.isBuffer(streamLike)) {
    return streamLike;
  }

  if (streamLike instanceof Uint8Array) {
    return Buffer.from(streamLike);
  }

  if (typeof streamLike === "string") {
    return Buffer.from(streamLike);
  }

  if (
    streamLike &&
    typeof streamLike === "object" &&
    "transformToByteArray" in streamLike &&
    typeof streamLike.transformToByteArray === "function"
  ) {
    const bytes = await streamLike.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (streamLike instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of streamLike) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (streamLike && typeof streamLike === "object" && Symbol.asyncIterator in streamLike) {
    const chunks: Buffer[] = [];
    for await (const chunk of streamLike as AsyncIterable<unknown>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported storage stream type.");
}

export async function ensureStorageFolders() {
  if (storageProvider !== "local") {
    return;
  }

  await mkdir(path.join(uploadsRoot, "transcripts"), { recursive: true });
  await mkdir(path.join(uploadsRoot, "reports"), { recursive: true });
}

export async function saveUploadFile(folder: StorageFolder, fileName: string, buffer: Buffer) {
  const storedPath = buildStoredPath(folder, fileName);

  if (storageProvider === "inline") {
    return buildInlineReference(folder, buffer);
  }

  if (storageProvider === "s3") {
    const s3 = getS3Client();
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: s3Bucket,
          Key: storedPath,
          Body: buffer,
          ContentType: contentTypeForFolder(folder),
        }),
      );
      return `s3://${s3Bucket}/${storedPath}`;
    } catch (error) {
      appLogger.warn({
        action: "storage_inline_fallback",
        area: "storage",
        status: "warning",
        message: "S3 upload failed; storing file inline so the production workflow can continue.",
        metadata: {
          folder,
          fileName,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      return buildInlineReference(folder, buffer);
    }
  }

  await ensureStorageFolders();
  const absolutePath = path.join(uploadsRoot, storedPath);
  await writeFile(absolutePath, buffer);
  return storedPath.replace(/\\/g, "/");
}

export function getAbsoluteStoragePath(reference: string) {
  if (isS3Reference(reference)) {
    throw new Error("Cannot resolve an absolute local path for S3 storage references.");
  }
  return path.join(uploadsRoot, reference);
}

export async function readStoredFile(reference: string) {
  if (isInlineReference(reference)) {
    return readInlineReference(reference);
  }

  if (isS3Reference(reference) || storageProvider === "s3") {
    const { bucket, key } = parseS3Reference(reference);
    const s3 = getS3Client();
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`Storage object is empty: ${reference}`);
    }

    return streamToBuffer(response.Body);
  }

  const absolutePath = getAbsoluteStoragePath(reference);
  return readFile(absolutePath);
}

export async function deleteStoredFile(reference: string) {
  if (isInlineReference(reference)) {
    return;
  }

  if (isS3Reference(reference) || storageProvider === "s3") {
    const { bucket, key } = parseS3Reference(reference);
    const s3 = getS3Client();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return;
  }

  const absolutePath = getAbsoluteStoragePath(reference);
  await unlink(absolutePath);
}
