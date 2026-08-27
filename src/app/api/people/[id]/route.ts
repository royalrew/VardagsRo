import { requireActor, assertCanManageHousehold } from "@/server/actor";
import { removePerson, updatePerson } from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { personUpdateSchema } from "@/server/schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function personId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new AppError(400, "INVALID_PERSON_ID", "Ogiltigt person-id.");
  }
  return value;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanManageHousehold(actor);
    const id = personId((await context.params).id);
    const input = personUpdateSchema.parse(await readJsonMutation(request));
    return json({ person: await updatePerson(actor, id, input) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanManageHousehold(actor);
    const id = personId((await context.params).id);
    await removePerson(actor, id);
    return json({ deleted: true, id });
  } catch (error) {
    return apiError(error);
  }
}
