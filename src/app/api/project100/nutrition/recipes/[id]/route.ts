import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  archiveProject100Recipe,
  updateProject100Recipe,
} from "@/server/project100-nutrition";
import { project100RecipeUpdateSchema } from "@/server/project100-nutrition-schemas";
import { project100IdSchema } from "@/server/project100-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const { id: rawId } = await props.params;
    const id = project100IdSchema.parse(rawId);
    const input = project100RecipeUpdateSchema.parse(
      await readJsonMutation(request, { maxBytes: 32 * 1024 }),
    );
    const recipe = await updateProject100Recipe(actor, id, input);
    return json({ recipe });
  } catch (error) {
    return apiError(error);
  }
}

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
    const archived = await archiveProject100Recipe(actor, id);
    return json({ archived });
  } catch (error) {
    return apiError(error);
  }
}
