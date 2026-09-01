import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { executeProject100QuickLog } from "@/server/project100-quick-log";
import { project100QuickLogSchema } from "@/server/project100-quick-log-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100QuickLogSchema.parse(
      await readJsonMutation(request, { maxBytes: 128 * 1024 }),
    );
    const result = await executeProject100QuickLog(actor, input);
    return json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
