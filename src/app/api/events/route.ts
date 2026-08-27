import { requireActor, assertCanMutate } from "@/server/actor";
import { saveManualEvent } from "@/server/database";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { manualEventSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const input = manualEventSchema.parse(await readJsonMutation(request));
    return json(await saveManualEvent(actor, input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
