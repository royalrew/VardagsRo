import { requireActor } from "@/server/actor";
import { loadDashboard } from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { signedSourceUrl } from "@/server/storage";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    const { id } = await context.params;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
      throw new AppError(400, "INVALID_DOCUMENT_ID", "Ogiltigt dokument-id.");
    }
    const data = await loadDashboard(actor);
    const document = data.documents.find((candidate) => candidate.id === id);
    if (!document) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Dokumentet finns inte.");
    }
    if (!document.storageKey) {
      throw new AppError(
        404,
        "SOURCE_NOT_AVAILABLE",
        "Originalfilen finns inte tillgänglig i demoläget.",
      );
    }
    return json({
      url: await signedSourceUrl(document.storageKey),
      expiresInSeconds: 300,
    });
  } catch (error) {
    return apiError(error);
  }
}
