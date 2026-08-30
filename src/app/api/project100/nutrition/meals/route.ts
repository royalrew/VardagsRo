import { assertCanMutate, requireActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { assertProject100Adult } from "@/server/project100";
import {
  loadProject100NutritionView,
  logProject100Meal,
} from "@/server/project100-nutrition";
import {
  project100MealSchema,
  project100NutritionDaySchema,
} from "@/server/project100-nutrition-schemas";
import { readJsonMutation } from "@/server/request-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    const params = new URL(request.url).searchParams;
    for (const [key] of params) {
      if (key !== "dag") {
        throw new AppError(400, "PROJECT100_UNKNOWN_QUERY", "Ogiltigt filter.");
      }
    }
    const { day } = project100NutritionDaySchema.parse({ day: params.get("dag") });
    return json(await loadProject100NutritionView(actor, day));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertProject100Adult(actor);
    assertCanMutate(actor);
    const input = project100MealSchema.parse(
      await readJsonMutation(request, { maxBytes: 32 * 1024 }),
    );
    return json({ meal: await logProject100Meal(actor, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
