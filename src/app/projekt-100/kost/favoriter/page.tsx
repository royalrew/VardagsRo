import type { Metadata } from "next";

import { FavoritesRecipesWorkspace } from "@/components/project100/FavoritesRecipesWorkspace";
import { calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100NutritionView, loadProject100Recipes } from "@/server/project100-nutrition";

export const metadata: Metadata = { title: "Favoriter & Recept – Projekt 100" };

export default async function Project100NutritionFavoritesPage() {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);

  const [recipes, view] = await Promise.all([
    loadProject100Recipes(actor),
    loadProject100NutritionView(actor),
  ]);

  const today = calendarDateInTimeZone(new Date(), view.timeZone || DEFAULT_TIME_ZONE);

  return (
    <FavoritesRecipesWorkspace
      initialRecipes={recipes}
      foods={view.foods}
      today={today}
    />
  );
}
