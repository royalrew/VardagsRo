import { requireActor, assertCanMutate } from "@/server/actor";
import { loadDashboard, saveManualTask } from "@/server/database";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { manualTaskSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const data = await loadDashboard(actor);
    return json({ tasks: data.tasks });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const input = manualTaskSchema.parse(await readJsonMutation(request));
    return json({ task: await saveManualTask(actor, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
