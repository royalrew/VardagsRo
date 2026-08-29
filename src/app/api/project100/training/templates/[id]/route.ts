import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { archiveProject100TrainingTemplate } from "@/server/project100-training";
import { project100TrainingIdSchema } from "@/server/project100-training-schemas";

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
    if (!(await archiveProject100TrainingTemplate(actor, id))) {
      throw new AppError(404, "PROJECT100_TEMPLATE_NOT_FOUND", "Mallen finns inte.");
    }
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
