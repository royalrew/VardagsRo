import { requireActor, assertCanManageHousehold } from "@/server/actor";
import { createPerson, loadDashboard } from "@/server/database";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { personCreateSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const data = await loadDashboard(actor);
    return json({ people: data.people });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanManageHousehold(actor);
    const input = personCreateSchema.parse(await readJsonMutation(request));
    return json({ person: await createPerson(actor, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
