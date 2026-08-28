import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { soloSettingsSchema } from "@/server/schemas";
import { saveSoloSettings } from "@/server/solo";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const input = soloSettingsSchema.parse(await readJsonMutation(request));
    return json({ settings: await saveSoloSettings(actor, input) });
  } catch (error) {
    return apiError(error);
  }
}
