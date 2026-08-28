import { requireActor, assertCanManageHousehold } from "@/server/actor";
import { listHouseholdLogins } from "@/server/database";
import { apiError, json } from "@/server/http";

export const runtime = "nodejs";

/** Owner only: who has access is the owner's business to see and to grant. */
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanManageHousehold(actor);
    return json({ logins: await listHouseholdLogins(actor) });
  } catch (error) {
    return apiError(error);
  }
}
