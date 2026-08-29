import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { saveProject100Supplement } from "@/server/project100-nutrition";
import { project100SupplementSchema } from "@/server/project100-nutrition-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100SupplementSchema.parse(
      await readJsonMutation(request, { maxBytes: 16 * 1024 }),
    );
    return json(
      { supplement: await saveProject100Supplement(actor, input) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
