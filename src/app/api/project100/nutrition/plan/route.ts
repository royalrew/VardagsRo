import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import { loadProject100MealPlanWeek, saveProject100MealPlan } from "@/server/project100-nutrition";
import { project100MealPlanSchema, project100WeekQuerySchema } from "@/server/project100-nutrition-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const { searchParams } = new URL(request.url);
    for (const [key] of searchParams) {
      if (key !== "vecka") {
        throw new AppError(400, "PROJECT100_UNKNOWN_QUERY", "Ogiltigt filter.");
      }
    }
    const query = project100WeekQuerySchema.parse({
      weekStart: searchParams.get("vecka") || null,
    });
    const week = await loadProject100MealPlanWeek(actor, query.weekStart);
    return json({ week });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100MealPlanSchema.parse(
      await readJsonMutation(request, { maxBytes: 16 * 1024 }),
    );
    const plan = await saveProject100MealPlan(actor, input);
    return json({ plan }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
