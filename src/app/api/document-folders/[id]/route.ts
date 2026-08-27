import { requireActor, assertCanMutate } from "@/server/actor";
import { removeDocumentFolder, updateDocumentFolder } from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { folderUpdateSchema } from "@/server/schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function folderId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new AppError(400, "INVALID_FOLDER_ID", "Ogiltigt mapp-id.");
  }
  return value;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const id = folderId((await context.params).id);
    const input = folderUpdateSchema.parse(await readJsonMutation(request));
    return json({ folder: await updateDocumentFolder(actor, id, input) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const id = folderId((await context.params).id);
    await removeDocumentFolder(actor, id);
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
