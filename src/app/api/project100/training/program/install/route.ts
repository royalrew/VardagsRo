import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { installStandard5DayProgram } from "@/server/project100-training";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    // CSRF check
    await readJsonMutation(request, { maxBytes: 1024 }).catch(() => ({}));
    const result = await installStandard5DayProgram(actor);
    return json(result);
  } catch (error) {
    return apiError(error);
  }
}
