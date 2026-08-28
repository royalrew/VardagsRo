import { hashPassword } from "better-auth/crypto";

import { requireActor, assertCanManageHousehold } from "@/server/actor";
import { createHouseholdLogin } from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { householdLoginSchema } from "@/server/schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Creates a login for a family member. Owner only: handing someone access to
 * the household's calendar and documents is not an ordinary edit.
 *
 * The password is chosen by the owner and passed on in person. The member is
 * expected to change it from inside the app afterwards.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireActor(request);
    assertCanManageHousehold(actor);

    const { id } = await context.params;
    const input = householdLoginSchema.parse(await readJsonMutation(request));
    if (input.personId !== id) {
      throw new AppError(400, "PERSON_MISMATCH", "Fel familjemedlem i begäran.");
    }

    const created = await createHouseholdLogin(actor, {
      personId: input.personId,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    });
    return json(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
