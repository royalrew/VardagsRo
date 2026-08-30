import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { saveProject100ProteinTarget } from "@/server/project100-nutrition";
import { project100ProteinTargetSchema } from "@/server/project100-nutrition-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100ProteinTargetSchema.parse(
      await readJsonMutation(request, { maxBytes: 4 * 1024 }),
    );
    return json({ proteinTargetG: await saveProject100ProteinTarget(actor, input) });
  } catch (error) {
    return apiError(error);
  }
}
