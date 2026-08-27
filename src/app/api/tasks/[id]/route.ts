import { requireActor, assertCanMutate } from "@/server/actor";
import { removeTask, updateTaskCompletion } from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { taskCompletionSchema } from "@/server/schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function taskId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new AppError(400, "INVALID_TASK_ID", "Ogiltigt uppgifts-id.");
  }
  return value;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const id = taskId((await context.params).id);
    const input = taskCompletionSchema.parse(await readJsonMutation(request));
    const task = await updateTaskCompletion(actor, id, input.completed);
    if (!task) {
      throw new AppError(404, "TASK_NOT_FOUND", "Uppgiften finns inte.");
    }
    return json({ task });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const id = taskId((await context.params).id);
    if (!(await removeTask(actor, id))) {
      throw new AppError(404, "TASK_NOT_FOUND", "Uppgiften finns inte.");
    }
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
