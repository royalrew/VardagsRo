import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  deleteProject100TrainingSession,
  updateProject100TrainingSession,
} from "@/server/project100-training";
import {
  project100SessionUpdateSchema,
  project100TrainingIdSchema,
} from "@/server/project100-training-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const id = project100TrainingIdSchema.parse((await context.params).id);
    if (!(await deleteProject100TrainingSession(actor, id))) {
      throw new AppError(404, "PROJECT100_SESSION_NOT_FOUND", "Passet finns inte.");
    }
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}

/** Carries out, moves or drops a planned session without touching its history. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const id = project100TrainingIdSchema.parse((await context.params).id);
    const input = project100SessionUpdateSchema.parse(
      await readJsonMutation(request, { maxBytes: 128 * 1024 }),
    );
    return json({ session: await updateProject100TrainingSession(actor, id, input) });
  } catch (error) {
    return apiError(error);
  }
}
