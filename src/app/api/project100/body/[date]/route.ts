import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { deleteProject100BodyEntry } from "@/server/project100-body";
import { project100CalendarDateSchema } from "@/server/project100-schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ date: string }>;
}

/** A measured day is addressed by its date; there is only ever one per day. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const date = project100CalendarDateSchema.parse((await context.params).date);
    if (!(await deleteProject100BodyEntry(actor, date))) {
      throw new AppError(404, "PROJECT100_BODY_NOT_FOUND", "Det finns ingen mätning den dagen.");
    }
    return json({ deleted: true, measuredOn: date });
  } catch (error) {
    return apiError(error);
  }
}
