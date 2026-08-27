import { requireActor, assertCanMutate } from "@/server/actor";
import { createDocumentFolder, loadDashboard } from "@/server/database";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { folderCreateSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const data = await loadDashboard(actor);
    return json({ folders: data.folders });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const input = folderCreateSchema.parse(await readJsonMutation(request));
    return json({ folder: await createDocumentFolder(actor, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
