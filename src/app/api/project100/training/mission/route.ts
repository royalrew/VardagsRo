import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  loadProject100DailyTrainingMission,
  startOrResumeProject100DailyTrainingMission,
} from "@/server/project100-training-missions";
import {
  project100DailyMissionStartSchema,
} from "@/server/project100-training-schemas";
import { project100CalendarDateSchema } from "@/server/project100-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) {
      if (key !== "date") {
        throw new AppError(400, "PROJECT100_UNKNOWN_QUERY", "Ogiltigt filter.");
      }
    }
    if (params.getAll("date").length > 1) {
      throw new AppError(400, "PROJECT100_UNKNOWN_QUERY", "Ogiltigt filter.");
    }
    const sessionDate = params.get("date");
    return json({
      mission: await loadProject100DailyTrainingMission(
        actor,
        sessionDate === null ? undefined : project100CalendarDateSchema.parse(sessionDate),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100DailyMissionStartSchema.parse(
      await readJsonMutation(request, { maxBytes: 16 * 1024 }),
    );
    return json(
      { mission: await startOrResumeProject100DailyTrainingMission(actor, input) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
