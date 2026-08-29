import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  createProject100TrainingSession,
  loadProject100TrainingSessions,
} from "@/server/project100-training";
import { project100SessionCreateSchema } from "@/server/project100-training-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

function assertNoQuery(request: Request): void {
  if ([...new URL(request.url).searchParams].length > 0) {
    throw new AppError(400, "PROJECT100_UNKNOWN_QUERY", "Ogiltigt filter.");
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertNoQuery(request);
    return json({ sessions: await loadProject100TrainingSessions(actor) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100SessionCreateSchema.parse(
      await readJsonMutation(request, { maxBytes: 128 * 1024 }),
    );
    return json(
      { session: await createProject100TrainingSession(actor, input) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
