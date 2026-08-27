import { createHash } from "node:crypto";

import { requireActor, assertCanMutate } from "@/server/actor";
import { extractDocument } from "@/server/ai";
import { loadDashboard } from "@/server/database";
import { AppError } from "@/server/errors";
import { HEALTH_DOCUMENT_MESSAGE, unsupportedHealthDocument } from "@/server/health-documents";
import { apiError, json } from "@/server/http";
import { assertTrustedMutationRequest } from "@/server/request-security";
import {
  MAX_UPLOAD_BYTES,
  safeDisplayFilename,
  validateUpload,
} from "@/server/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

function uploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string"
  );
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    assertTrustedMutationRequest(request);
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_UPLOAD_BYTES + 1024 * 1024
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
        "Skicka filen som multipart/form-data.",
      );
    }

    const file = form.get("file");
    if (!uploadedFile(file)) {
      throw new AppError(400, "FILE_REQUIRED", "Välj en fil att läsa in.");
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
    const data = await loadDashboard(actor);

    const extraction = await extractDocument({
      bytes,
      filename,
      mimeType,
      hash,
      people: data.people,
      timezone: data.timezone,
    });

    // Refused before the extraction is handed back, so the care text never
    // reaches the browser either.
    if (unsupportedHealthDocument(extraction)) {
      throw new AppError(415, "HEALTH_DOCUMENT_NOT_SUPPORTED", HEALTH_DOCUMENT_MESSAGE);
    }

    return json({ ...extraction, storageKey: null }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
