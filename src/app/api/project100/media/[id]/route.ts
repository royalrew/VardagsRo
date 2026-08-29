import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { deleteProject100Media } from "@/server/project100-media";
import { project100MediaIdSchema } from "@/server/project100-media-schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const id = project100MediaIdSchema.parse((await context.params).id);
    if (!(await deleteProject100Media(actor, id))) {
      throw new AppError(404, "PROJECT100_MEDIA_NOT_FOUND", "Bilden finns inte.");
    }
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
