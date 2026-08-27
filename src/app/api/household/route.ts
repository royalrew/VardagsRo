import { requireActor, assertCanManageHousehold } from "@/server/actor";
import { updateHouseholdName } from "@/server/database";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { householdUpdateSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanManageHousehold(actor);
    const input = householdUpdateSchema.parse(await readJsonMutation(request));
    return json({ familyName: await updateHouseholdName(actor, input) });
  } catch (error) {
    return apiError(error);
  }
}
