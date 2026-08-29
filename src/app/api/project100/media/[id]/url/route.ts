import { requireActor } from "@/server/actor";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { signedProject100MediaOriginalUrl } from "@/server/project100-media";
import { project100MediaIdSchema } from "@/server/project100-media-schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** A full-size private picture is opened one signed request at a time. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const id = project100MediaIdSchema.parse((await context.params).id);
    return json(await signedProject100MediaOriginalUrl(actor, id));
  } catch (error) {
    return apiError(error);
  }
}
