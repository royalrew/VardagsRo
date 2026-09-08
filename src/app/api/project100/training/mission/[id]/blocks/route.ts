import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { appendProject100TrainingBlock } from "@/server/project100-training-missions";
import {
  project100TrainingBlockAppendSchema,
  project100TrainingIdSchema,
} from "@/server/project100-training-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const id = project100TrainingIdSchema.parse((await context.params).id);
    const input = project100TrainingBlockAppendSchema.parse(
      await readJsonMutation(request, { maxBytes: 128 * 1024 }),
    );
    const result = await appendProject100TrainingBlock(actor, id, input);
    return json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
