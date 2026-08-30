import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { saveProject100RecipeFromBatch } from "@/server/project100-nutrition";
import { project100RecipeFromBatchSchema } from "@/server/project100-nutrition-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100RecipeFromBatchSchema.parse(
      await readJsonMutation(request, { maxBytes: 16 * 1024 }),
    );
    const recipe = await saveProject100RecipeFromBatch(actor, input);
    return json({ recipe }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
