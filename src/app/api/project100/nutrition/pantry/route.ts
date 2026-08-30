import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { updateProject100PantryStock } from "@/server/project100-nutrition";
import { project100PantryStockSchema } from "@/server/project100-nutrition-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100PantryStockSchema.parse(
      await readJsonMutation(request, { maxBytes: 16 * 1024 }),
    );
    const food = await updateProject100PantryStock(actor, input);
    return json({ food });
  } catch (error) {
    return apiError(error);
  }
}
