import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { removeSoloAction } from "@/server/solo";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function soloActionId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new AppError(400, "INVALID_SOLO_ACTION_ID", "Ogiltigt id.");
  }
  return value;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const id = soloActionId((await context.params).id);
    if (!(await removeSoloAction(actor, id))) {
      throw new AppError(404, "SOLO_ACTION_NOT_FOUND", "Posten finns inte.");
    }
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
