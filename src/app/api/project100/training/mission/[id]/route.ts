import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { finishProject100DailyTrainingMission } from "@/server/project100-training-missions";
import {
  project100DailyMissionFinishSchema,
  project100TrainingIdSchema,
} from "@/server/project100-training-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const id = project100TrainingIdSchema.parse((await context.params).id);
    const input = project100DailyMissionFinishSchema.parse(
      await readJsonMutation(request, { maxBytes: 16 * 1024 }),
    );
    return json({ mission: await finishProject100DailyTrainingMission(actor, id, input) });
  } catch (error) {
    return apiError(error);
  }
}
