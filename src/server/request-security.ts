import { appBaseUrl, isProductionRuntime } from "@/server/config";
import { AppError } from "@/server/errors";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 256 * 1024;

export interface JsonMutationOptions {
  maxBytes?: number;
}

function rejectOrigin(): never {
  throw new AppError(
    403,
    "INVALID_REQUEST_ORIGIN",
    "Begäran tillåts inte från den här webbplatsen.",
  );
}

/**
 * Protects browser mutations from cross-site requests. Production requests must
 * carry an exact Origin match; development also rejects every supplied foreign
 * or opaque (`null`) origin while permitting tools that omit Origin entirely.
 */
export function assertTrustedMutationRequest(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") {
    throw new AppError(
      403,
      "CROSS_SITE_REQUEST",
      "Begäran tillåts inte från en annan webbplats.",
    );
  }

  const origin = request.headers.get("origin");
  if (origin !== null && (origin === "null" || origin !== appBaseUrl())) {
    rejectOrigin();
  }

  if (isProductionRuntime() && origin === null) {
    rejectOrigin();
  }
}

function assertJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type");
  if (!contentType) {
    throw new AppError(
      415,
      "JSON_CONTENT_TYPE_REQUIRED",
      "Content-Type måste vara application/json.",
    );
  }

  const parts = contentType.split(";").map((part) => part.trim());
  const mediaType = parts.shift()?.toLowerCase();
  const hasValidParameters =
    parts.length <= 1 &&
    parts.every((part) => /^charset\s*=\s*(?:utf-8|"utf-8")$/i.test(part));

  if (mediaType !== "application/json" || !hasValidParameters) {
    throw new AppError(
      415,
      "JSON_CONTENT_TYPE_REQUIRED",
      "Content-Type måste vara application/json.",
    );
  }
}

function assertedBodyLimit(maxBytes: number): number {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer.");
  }
  return maxBytes;
}

function declaredContentLength(request: Request): number | null {
  const value = request.headers.get("content-length")?.trim();
  if (!value || !/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function bodyTooLarge(): AppError {
  return new AppError(
    413,
    "REQUEST_BODY_TOO_LARGE",
    "Begärans innehåll är för stort.",
  );
}

async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = declaredContentLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw bodyTooLarge();
  }

  if (!request.body) return new Uint8Array();

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size error below is authoritative even if cancellation fails.
        }
        throw bodyTooLarge();
      }
      chunks.push(value);
    }
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError(
      400,
      "INVALID_REQUEST_BODY",
      "Begärans innehåll kunde inte läsas.",
      { cause },
    );
  } finally {
    reader?.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Validates a same-origin JSON mutation, enforces the actual UTF-8 byte size,
 * consumes the request body once, and parses it once.
 */
export async function readJsonMutation<T = unknown>(
  request: Request,
  options: JsonMutationOptions = {},
): Promise<T> {
  assertTrustedMutationRequest(request);
  assertJsonContentType(request);

  const maxBytes = assertedBodyLimit(
    options.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES,
  );
  const body = await readBodyBytes(request, maxBytes);

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new AppError(400, "INVALID_JSON", "Skicka giltig JSON.", { cause });
  }
}
