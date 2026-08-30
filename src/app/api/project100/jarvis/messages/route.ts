import { assertCanMutate, requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { sendProject100JarvisMessage } from "@/server/project100-jarvis";
import { sendJarvisMessageSchema } from "@/server/project100-jarvis-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const body = await readJsonMutation(request, { maxBytes: 16 * 1024 });
    const input = sendJarvisMessageSchema.parse(body);
    const result = await sendProject100JarvisMessage(actor, input);
    return json(result);
  } catch (error) {
    return apiError(error);
  }
}
