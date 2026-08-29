import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { archiveProject100Supplement } from "@/server/project100-nutrition";
import { project100IdSchema } from "@/server/project100-schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const id = project100IdSchema.parse((await context.params).id);
    if (!(await archiveProject100Supplement(actor, id))) {
      throw new AppError(404, "PROJECT100_SUPPLEMENT_NOT_FOUND", "Tillskottet finns inte.");
    }
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
