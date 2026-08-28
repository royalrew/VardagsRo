import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { soloHealthSchema } from "@/server/schemas";
import { saveSoloHealthDay } from "@/server/solo";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const input = soloHealthSchema.parse(await readJsonMutation(request));
    return json({ day: await saveSoloHealthDay(actor, input) });
  } catch (error) {
    return apiError(error);
  }
}
