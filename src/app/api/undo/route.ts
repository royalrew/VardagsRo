import { requireActor, assertCanMutate } from "@/server/actor";
import { latestUndoableDeletion, undoDeletion } from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { undoRequestSchema } from "@/server/schemas";

export const runtime = "nodejs";

/** What could be taken back right now, so the interface can offer it. */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    return json({ undo: await latestUndoableDeletion(actor) });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Undo is a change like any other, so it needs the same permission as the
 * deletion did. A viewer who cannot delete must not be able to restore either.
 */
export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const input = undoRequestSchema.parse(await readJsonMutation(request));
    const restored = await undoDeletion(actor, input.id);
    return json(restored);
  } catch (error) {
    if (error instanceof AppError) return apiError(error);
    return apiError(error);
  }
}
