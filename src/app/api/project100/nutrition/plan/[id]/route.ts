import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { deleteProject100MealPlan } from "@/server/project100-nutrition";
import { project100IdSchema } from "@/server/project100-schemas";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const { id: rawId } = await props.params;
    const id = project100IdSchema.parse(rawId);
    const deleted = await deleteProject100MealPlan(actor, id);
    return json({ deleted });
  } catch (error) {
    return apiError(error);
  }
}
