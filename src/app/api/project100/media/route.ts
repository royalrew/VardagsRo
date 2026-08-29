import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  createProject100Media,
  loadProject100MediaLibrary,
} from "@/server/project100-media";
import {
  project100MediaCreateSchema,
  project100MediaFilterSchema,
} from "@/server/project100-media-schemas";
import { assertTrustedMutationRequest } from "@/server/request-security";
import { MAX_PROJECT100_PREVIEW_BYTES, MAX_UPLOAD_BYTES } from "@/server/storage";

export const runtime = "nodejs";

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function uploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string"
  );
}

function textField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (value === null) return undefined;
  if (typeof value !== "string") {
    throw new AppError(400, "PROJECT100_MEDIA_FIELD_INVALID", `Fältet ${name} är ogiltigt.`);
  }
  return value.trim() === "" ? undefined : value;
}

function tooLarge(): AppError {
  return new AppError(413, "FILE_TOO_LARGE", "Bilden är för stor. Maximal storlek är 12 MB.");
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const params = new URL(request.url).searchParams;
    const known = new Set(["category", "limit"]);
    for (const [key] of params) {
      if (!known.has(key)) {
        throw new AppError(400, "PROJECT100_UNKNOWN_QUERY", "Ogiltigt filter.");
      }
    }
    const filter = project100MediaFilterSchema.parse({
      category: params.get("category"),
      ...(params.has("limit") ? { limit: params.get("limit") } : {}),
    });
    return json(await loadProject100MediaLibrary(actor, filter));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    // This request never reaches readJsonMutation, so the cross-site guard is
    // applied here on its own.
    assertTrustedMutationRequest(request);

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      throw new AppError(
        415,
        "PROJECT100_MULTIPART_REQUIRED",
        "Skicka bilden som multipart/form-data.",
      );
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_UPLOAD_BYTES + MAX_PROJECT100_PREVIEW_BYTES + MAX_MULTIPART_OVERHEAD_BYTES
    ) {
      throw tooLarge();
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError(
        400,
        "INVALID_MULTIPART_BODY",
        "Bilden kunde inte läsas. Försök igen.",
      );
    }

    const input = project100MediaCreateSchema.parse({
      category: textField(form, "category"),
      capturedOn: textField(form, "capturedOn"),
      caption: textField(form, "caption") ?? null,
      sessionId: textField(form, "sessionId") ?? null,
      width: textField(form, "width") ?? null,
      height: textField(form, "height") ?? null,
    });

    const file = form.get("file");
    if (!uploadedFile(file)) {
      throw new AppError(400, "FILE_REQUIRED", "Bilden saknas.");
    }
    if (file.size > MAX_UPLOAD_BYTES) throw tooLarge();

    const previewFile = form.get("preview");
    const preview =
      uploadedFile(previewFile) && previewFile.size > 0 && previewFile.size <= MAX_PROJECT100_PREVIEW_BYTES
        ? {
            bytes: new Uint8Array(await previewFile.arrayBuffer()),
            declaredMimeType: previewFile.type,
          }
        : null;

    const media = await createProject100Media(actor, input, {
      original: {
        bytes: new Uint8Array(await file.arrayBuffer()),
        declaredMimeType: file.type,
      },
      preview,
    });
    return json({ media }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
