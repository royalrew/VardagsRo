import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { saveProject100Settings } from "@/server/project100-body";
import { project100SettingsSchema } from "@/server/project100-body-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

/** Målvikt, startvikt och längd. The direction the numbers are measured against. */
export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100SettingsSchema.parse(
      await readJsonMutation(request, { maxBytes: 8 * 1024 }),
    );
    return json({ goal: await saveProject100Settings(actor, input) });
  } catch (error) {
    return apiError(error);
  }
}
