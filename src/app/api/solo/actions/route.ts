import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { soloActionSchema } from "@/server/schemas";
import { logSoloAction } from "@/server/solo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const input = soloActionSchema.parse(await readJsonMutation(request));
    return json({ action: await logSoloAction(actor, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
