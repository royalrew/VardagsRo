import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { saveProject100Batch } from "@/server/project100-nutrition";
import { project100BatchSchema } from "@/server/project100-nutrition-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100BatchSchema.parse(
      await readJsonMutation(request, { maxBytes: 32 * 1024 }),
    );
    return json({ batch: await saveProject100Batch(actor, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
