import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { project100IdSchema } from "@/server/project100-schemas";
import { saveProject100ExerciseMuscleGroups } from "@/server/project100-strength";
import { project100ExerciseMuscleGroupsSchema } from "@/server/project100-strength-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const { id: rawId } = await props.params;
    const exerciseId = project100IdSchema.parse(rawId);
    const input = project100ExerciseMuscleGroupsSchema.parse(
      await readJsonMutation(request, { maxBytes: 8 * 1024 }),
    );
    const muscleGroups = await saveProject100ExerciseMuscleGroups(
      actor,
      exerciseId,
      input.muscleGroups,
    );
    return json({ muscleGroups });
  } catch (error) {
    return apiError(error);
  }
}
