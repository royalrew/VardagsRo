import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { loadProject100Recipes, saveProject100Recipe } from "@/server/project100-nutrition";
import { project100RecipeSchema } from "@/server/project100-nutrition-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const recipes = await loadProject100Recipes(actor);
    return json({ recipes });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100RecipeSchema.parse(
      await readJsonMutation(request, { maxBytes: 32 * 1024 }),
    );
    const recipe = await saveProject100Recipe(actor, input);
    return json({ recipe }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
