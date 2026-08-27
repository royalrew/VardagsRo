import { requireActor, assertCanMutate } from "@/server/actor";
import {
  getDocument,
  loadDashboard,
  removeDocument,
  updateDocumentOrganization,
} from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { documentOrganizationSchema } from "@/server/schemas";
import { deleteSource, signedSourceUrl } from "@/server/storage";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function documentId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new AppError(400, "INVALID_DOCUMENT_ID", "Ogiltigt dokument-id.");
  }
  return value;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    const id = documentId((await context.params).id);
    const data = await loadDashboard(actor);
    const document = data.documents.find((candidate) => candidate.id === id);
    if (!document) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Dokumentet finns inte.");
    }
    const url = document.storageKey
      ? await signedSourceUrl(document.storageKey)
      : null;
    return json({ document, url, expiresInSeconds: url ? 300 : null });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const id = documentId((await context.params).id);
    const input = documentOrganizationSchema.parse(await readJsonMutation(request));
    return json({ document: await updateDocumentOrganization(actor, id, input) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const id = documentId((await context.params).id);
    const document = await getDocument(actor, id);
    if (!document) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Dokumentet finns inte.");
    }

    let storageDeleted: boolean | null = null;
    if (document.storageKey) {
      storageDeleted = await deleteSource(document.storageKey);
      if (!storageDeleted) {
        throw new AppError(
          503,
          "DOCUMENT_STORAGE_DELETE_FAILED",
          "Originalfilen kunde inte tas bort. Dokumentet finns kvar.",
        );
      }
    }

    let result: Awaited<ReturnType<typeof removeDocument>>;
    try {
      result = await removeDocument(actor, id, document);
    } catch (cause) {
      if (cause instanceof AppError && cause.code === "DOCUMENT_NOT_FOUND") {
        throw cause;
      }
      throw new AppError(
        500,
        "DOCUMENT_DATABASE_DELETE_FAILED",
        "Originalfilen togs bort, men dokumentposten kunde inte tas bort.",
        { cause },
      );
    }
    return json({
      deleted: true,
      id,
      deletedEvents: result.deletedEvents,
      deletedTasks: result.deletedTasks,
      storageDeleted,
    });
  } catch (error) {
    return apiError(error);
  }
}
