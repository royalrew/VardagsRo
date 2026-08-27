import { createHash } from "node:crypto";

import { requireActor, assertCanMutate } from "@/server/actor";
import { demoFallbackAllowed } from "@/server/config";
import { loadDashboard, saveConfirmedDocument } from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertTrustedMutationRequest, readJsonMutation } from "@/server/request-security";
import { confirmDocumentSchema } from "@/server/schemas";
import {
  deleteSource,
  MAX_UPLOAD_BYTES,
  safeDisplayFilename,
  uploadSource,
  validateUpload,
} from "@/server/storage";

export const runtime = "nodejs";

const MAX_CONFIRM_INPUT_BYTES = 256 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function uploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string"
  );
}

function parseInputJson(value: string): unknown {
  if (Buffer.byteLength(value, "utf8") > MAX_CONFIRM_INPUT_BYTES) {
    throw new AppError(413, "CONFIRM_INPUT_TOO_LARGE", "Dokumentuppgifterna är för stora.");
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(400, "INVALID_CONFIRM_INPUT", "Dokumentuppgifterna är inte giltig JSON.");
  }
}

function requireUnstoredExtraction(storageKey: string | null): void {
  if (storageKey !== null) {
    throw new AppError(
      400,
      "CLIENT_STORAGE_KEY_NOT_ALLOWED",
      "Lagringsnyckeln skapas av servern när dokumentet bekräftas.",
    );
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    return json(await loadDashboard(actor));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    // The multipart branch never reaches readJsonMutation, so the cross-site
    // check is made explicitly for both shapes of this request.
    assertTrustedMutationRequest(request);
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.startsWith("multipart/form-data")) {
      if (!demoFallbackAllowed()) {
        throw new AppError(
          415,
          "CONFIRM_MULTIPART_REQUIRED",
          "Bekräfta dokumentet med originalfilen.",
        );
      }
      const demoInput = confirmDocumentSchema.parse(await readJsonMutation(request));
      requireUnstoredExtraction(demoInput.extraction.storageKey);
      return json(await saveConfirmedDocument(actor, demoInput), { status: 201 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES
    ) {
      throw new AppError(
        413,
        "FILE_TOO_LARGE",
        "Filen är för stor. Maximal storlek är 12 MB.",
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError(
        400,
        "INVALID_MULTIPART_BODY",
        "Skicka dokumentuppgifterna och originalfilen som multipart/form-data.",
      );
    }

    const serializedInput = form.get("input");
    if (typeof serializedInput !== "string") {
      throw new AppError(400, "CONFIRM_INPUT_REQUIRED", "Dokumentuppgifterna saknas.");
    }
    const input = confirmDocumentSchema.parse(parseInputJson(serializedInput));
    requireUnstoredExtraction(input.extraction.storageKey);

    const file = form.get("file");
    if (!uploadedFile(file)) {
      throw new AppError(400, "FILE_REQUIRED", "Originalfilen saknas.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError(
        413,
        "FILE_TOO_LARGE",
        "Filen är för stor. Maximal storlek är 12 MB.",
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = validateUpload(bytes, file.type);
    const filename = safeDisplayFilename(file.name, mimeType);
    const hash = createHash("sha256").update(bytes).digest("hex");

    if (mimeType !== input.extraction.mimeType) {
      throw new AppError(
        400,
        "CONFIRM_MIME_MISMATCH",
        "Originalfilens filtyp stämmer inte med dokumenttolkningen.",
      );
    }
    if (filename !== input.extraction.originalFilename) {
      throw new AppError(
        400,
        "CONFIRM_FILENAME_MISMATCH",
        "Originalfilens namn stämmer inte med dokumenttolkningen.",
      );
    }
    if (hash !== input.extraction.hash) {
      throw new AppError(
        400,
        "CONFIRM_HASH_MISMATCH",
        "Originalfilens innehåll stämmer inte med dokumenttolkningen.",
      );
    }

    const storageKey = await uploadSource(actor.householdId, bytes, mimeType, hash);
    if (storageKey === null && !demoFallbackAllowed()) {
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Originalfilen kunde inte lagras just nu.",
      );
    }

    try {
      const saved = await saveConfirmedDocument(actor, {
        ...input,
        extraction: { ...input.extraction, storageKey },
      });
      return json(saved, { status: 201 });
    } catch (error) {
      if (storageKey) {
        try {
          await deleteSource(storageKey);
        } catch {
          // Best effort: preserve the database error even if R2 compensation fails.
        }
      }
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
