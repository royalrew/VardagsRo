import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { demoFallbackAllowed, r2Config } from "@/server/config";
import { AppError } from "@/server/errors";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_FILE_TYPES = {
  "image/jpeg": { extension: "jpg", label: "JPG" },
  "image/png": { extension: "png", label: "PNG" },
  "image/webp": { extension: "webp", label: "WebP" },
  "application/pdf": { extension: "pdf", label: "PDF" },
} as const;

export type AcceptedMimeType = keyof typeof ACCEPTED_FILE_TYPES;

let client: S3Client | null = null;
let clientFingerprint = "";

function storageClient(): { client: S3Client; bucket: string } | null {
  const config = r2Config();
  if (!config) return null;

  const fingerprint = `${config.endpoint}\n${config.accessKeyId}\n${config.bucket}`;
  if (!client || clientFingerprint !== fingerprint) {
    client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    clientFingerprint = fingerprint;
  }

  return { client, bucket: config.bucket };
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function detectedMimeType(bytes: Uint8Array): AcceptedMimeType | null {
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") {
    return "application/pdf";
  }
  return null;
}

export function validateUpload(
  bytes: Uint8Array,
  declaredMimeType: string,
): AcceptedMimeType {
  if (bytes.byteLength === 0) {
    throw new AppError(400, "EMPTY_FILE", "Filen är tom.");
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      "Filen är för stor. Maximal storlek är 12 MB.",
    );
  }

  const declared = declaredMimeType.toLowerCase().split(";")[0].trim();
  const normalized =
    ({
      "image/jpg": "image/jpeg",
      "image/pjpeg": "image/jpeg",
      "application/x-pdf": "application/pdf",
    } as Record<string, string>)[declared] ?? declared;
  if (
    normalized &&
    normalized !== "application/octet-stream" &&
    !(normalized in ACCEPTED_FILE_TYPES)
  ) {
    throw new AppError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "Välj en fil i JPG-, PNG-, WebP- eller PDF-format.",
    );
  }

  const detected = detectedMimeType(bytes);
  if (
    detected === null ||
    (normalized in ACCEPTED_FILE_TYPES && detected !== normalized)
  ) {
    throw new AppError(
      415,
      "FILE_SIGNATURE_MISMATCH",
      "Filens innehåll stämmer inte med dess filtyp.",
    );
  }

  return detected;
}

export function safeDisplayFilename(value: string, mimeType: AcceptedMimeType): string {
  const extension = ACCEPTED_FILE_TYPES[mimeType].extension;
  const withoutPath = value.replace(/\\/g, "/").split("/").pop() ?? "dokument";
  const clean = withoutPath
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .trim()
    .slice(0, 160);
  if (!clean) return `dokument.${extension}`;
  const expectedSuffixes =
    mimeType === "image/jpeg" ? [".jpg", ".jpeg"] : [`.${extension}`];
  if (expectedSuffixes.some((suffix) => clean.toLowerCase().endsWith(suffix))) {
    return clean;
  }
  const stem = clean.replace(/\.[^.]{1,12}$/, "").slice(0, 145) || "dokument";
  return `${stem}.${extension}`;
}

function storageKey(householdId: string, mimeType: AcceptedMimeType): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = ACCEPTED_FILE_TYPES[mimeType].extension;
  return `${householdId}/documents/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

/**
 * The first segment is the household, so an object's own name says which family
 * it belongs to. Keys written before households were separated begin with
 * `household-demo`, which this pattern still accepts.
 */
function validStorageKey(key: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/documents\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp|pdf)$/i.test(
    key,
  );
}

export function storageIsConfigured(): boolean {
  return r2Config() !== null;
}

export async function storageIsHealthy(): Promise<boolean> {
  const storage = storageClient();
  if (!storage) return false;
  try {
    await storage.client.send(
      new HeadBucketCommand({ Bucket: storage.bucket }),
      { abortSignal: AbortSignal.timeout(5_000) },
    );
    return true;
  } catch {
    return false;
  }
}

export async function uploadSource(
  householdId: string,
  bytes: Uint8Array,
  mimeType: AcceptedMimeType,
  sha256: string,
): Promise<string | null> {
  const storage = storageClient();
  if (!storage) {
    if (demoFallbackAllowed()) return null;
    throw new AppError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Fillagringen är inte konfigurerad.",
    );
  }

  const key = storageKey(householdId, mimeType);
  try {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        Metadata: { sha256 },
      }),
      { abortSignal: AbortSignal.timeout(20_000) },
    );
  } catch (cause) {
    if (demoFallbackAllowed()) return null;
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "Originalfilen kunde inte lagras just nu.",
      { cause },
    );
  }
  return key;
}

export async function signedSourceUrl(key: string): Promise<string> {
  if (!validStorageKey(key)) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Ogiltig lagringsnyckel.");
  }
  const storage = storageClient();
  if (!storage) {
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Fillagringen är inte konfigurerad.");
  }
  try {
    return await getSignedUrl(
      storage.client,
      new GetObjectCommand({ Bucket: storage.bucket, Key: key }),
      { expiresIn: 300 },
    );
  } catch (cause) {
    throw new AppError(
      502,
      "SIGNED_URL_FAILED",
      "Källfilen kunde inte öppnas.",
      { cause },
    );
  }
}

export async function deleteSource(key: string): Promise<boolean> {
  if (!validStorageKey(key)) return false;
  const storage = storageClient();
  if (!storage) return false;
  try {
    await storage.client.send(
      new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    return true;
  } catch {
    return false;
  }
}

/* Projekt 100 media. Family documents live under a household prefix; a body
   photo must not. These objects carry the owner's user id in the key itself,
   which lets every read check the key against the reader before signing it. */

export const PROJECT100_MEDIA_CATEGORIES = ["body", "food", "training", "content"] as const;
export type Project100MediaCategory = (typeof PROJECT100_MEDIA_CATEGORIES)[number];

export const PROJECT100_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type Project100ImageMimeType = (typeof PROJECT100_IMAGE_TYPES)[number];

export const MAX_PROJECT100_PREVIEW_BYTES = 1024 * 1024;

export interface Project100MediaKeys {
  originalKey: string;
  previewKey: string | null;
}

function isImageMimeType(value: AcceptedMimeType): value is Project100ImageMimeType {
  return value !== "application/pdf";
}

/** A document may be a PDF; a memory of a body or a meal is a picture. */
export function validateProject100Image(
  bytes: Uint8Array,
  declaredMimeType: string,
): Project100ImageMimeType {
  const mimeType = validateUpload(bytes, declaredMimeType);
  if (!isImageMimeType(mimeType)) {
    throw new AppError(
      415,
      "PROJECT100_IMAGE_REQUIRED",
      "Välj en bild i JPG-, PNG- eller WebP-format.",
    );
  }
  return mimeType;
}

function project100MediaKey(
  userId: string,
  category: Project100MediaCategory,
  mimeType: Project100ImageMimeType,
  id: string,
  variant: "original" | "preview",
): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = ACCEPTED_FILE_TYPES[mimeType].extension;
  const suffix = variant === "preview" ? "-preview" : "";
  return `p100/${userId}/${category}/${year}/${month}/${id}${suffix}.${extension}`;
}

/**
 * True only when the key names this exact owner. A key that reaches the server
 * from a row, an export or a hand-written request is still checked against the
 * account asking for it, so a leaked key cannot be turned into a signed URL.
 */
const PROJECT100_MEDIA_KEY =
  /^p100\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/(?:body|food|training|content)\/\d{4}\/\d{2}\/[0-9a-f-]{36}(?:-preview)?\.(?:jpg|png|webp)$/;

export function project100MediaKeyBelongsTo(userId: string, key: string): boolean {
  const owner = PROJECT100_MEDIA_KEY.exec(key)?.[1];
  return owner !== undefined && owner === userId;
}

function requireStorage(): { client: S3Client; bucket: string } {
  const storage = storageClient();
  if (!storage) {
    throw new AppError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Bildlagringen är inte konfigurerad, så bilden kan inte sparas privat.",
    );
  }
  return storage;
}

async function putProject100Object(
  key: string,
  bytes: Uint8Array,
  mimeType: Project100ImageMimeType,
  sha256: string,
): Promise<void> {
  const storage = requireStorage();
  try {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        Metadata: { sha256 },
      }),
      { abortSignal: AbortSignal.timeout(20_000) },
    );
  } catch (cause) {
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "Bilden kunde inte lagras just nu.",
      { cause },
    );
  }
}

/**
 * Writes the original and, when the client produced one, a small preview. The
 * preview is only ever an optimisation: losing it costs speed, never a memory.
 */
export async function uploadProject100Media(input: {
  userId: string;
  mediaId: string;
  category: Project100MediaCategory;
  sha256: string;
  original: { bytes: Uint8Array; mimeType: Project100ImageMimeType };
  preview: { bytes: Uint8Array; mimeType: Project100ImageMimeType } | null;
}): Promise<Project100MediaKeys> {
  requireStorage();
  const originalKey = project100MediaKey(
    input.userId,
    input.category,
    input.original.mimeType,
    input.mediaId,
    "original",
  );
  await putProject100Object(
    originalKey,
    input.original.bytes,
    input.original.mimeType,
    input.sha256,
  );

  if (!input.preview) return { originalKey, previewKey: null };

  const previewKey = project100MediaKey(
    input.userId,
    input.category,
    input.preview.mimeType,
    input.mediaId,
    "preview",
  );
  try {
    await putProject100Object(
      previewKey,
      input.preview.bytes,
      input.preview.mimeType,
      input.sha256,
    );
  } catch {
    // The original is already safe. A missing preview must not lose the upload.
    return { originalKey, previewKey: null };
  }
  return { originalKey, previewKey };
}

export async function signedProject100MediaUrl(
  userId: string,
  key: string,
  expiresInSeconds = 300,
): Promise<string> {
  if (!project100MediaKeyBelongsTo(userId, key)) {
    throw new AppError(403, "PROJECT100_MEDIA_FORBIDDEN", "Bilden tillhör inte ditt konto.");
  }
  const storage = requireStorage();
  try {
    return await getSignedUrl(
      storage.client,
      new GetObjectCommand({ Bucket: storage.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  } catch (cause) {
    throw new AppError(502, "SIGNED_URL_FAILED", "Bilden kunde inte öppnas.", { cause });
  }
}

/** Returns false when the object survived, so a caller can report an honest partial delete. */
export async function deleteProject100MediaObject(
  userId: string,
  key: string,
): Promise<boolean> {
  if (!project100MediaKeyBelongsTo(userId, key)) return false;
  const storage = storageClient();
  if (!storage) return false;
  try {
    await storage.client.send(
      new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    return true;
  } catch {
    return false;
  }
}
