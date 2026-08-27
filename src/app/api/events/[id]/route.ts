import { requireActor, assertCanMutate } from "@/server/actor";
import { removeEvent, updateManualEvent } from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { eventUpdateSchema } from "@/server/schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function validEventId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const { id } = await context.params;
    if (!validEventId(id)) {
      throw new AppError(400, "INVALID_EVENT_ID", "Ogiltigt händelse-id.");
    }

    const event = await updateManualEvent(
      actor,
      id,
      eventUpdateSchema.parse(await readJsonMutation(request)),
    );
    if (!event) {
      throw new AppError(404, "EVENT_NOT_FOUND", "Händelsen finns inte.");
    }
    return json({ event });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const { id } = await context.params;
    if (!validEventId(id)) {
      throw new AppError(400, "INVALID_EVENT_ID", "Ogiltigt händelse-id.");
    }
    if (!(await removeEvent(actor, id))) {
      throw new AppError(404, "EVENT_NOT_FOUND", "Händelsen finns inte.");
    }
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
