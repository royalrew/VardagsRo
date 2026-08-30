import type { Metadata } from "next";

import { MealPlanningWorkspace } from "@/components/project100/MealPlanningWorkspace";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100MealPlanWeek } from "@/server/project100-nutrition";
import { project100WeekQuerySchema } from "@/server/project100-nutrition-schemas";

export const metadata: Metadata = { title: "Veckoplanering & Inköp – Projekt 100" };

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function Project100NutritionPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{
    vecka?: string | string[];
  }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);

  const query = await searchParams;
  const parsed = project100WeekQuerySchema.safeParse({ weekStart: first(query.vecka) });
  const week = await loadProject100MealPlanWeek(
    actor,
    parsed.success ? parsed.data.weekStart : null,
  );

  return <MealPlanningWorkspace initialWeek={week} />;
}
