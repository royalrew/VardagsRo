import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { cookBatchFromRecipe } from "@/server/project100-nutrition";
import { project100CookBatchFromRecipeSchema } from "@/server/project100-nutrition-schemas";
import { project100IdSchema } from "@/server/project100-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const { id: rawId } = await props.params;
    const recipeId = project100IdSchema.parse(rawId);
    const payload = await readJsonMutation(request, { maxBytes: 16 * 1024 });
    const input = project100CookBatchFromRecipeSchema.parse(
      typeof payload === "object" && payload !== null ? { ...payload, recipeId } : { recipeId },
    );
    const batch = await cookBatchFromRecipe(actor, input);
    return json({ batch }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
