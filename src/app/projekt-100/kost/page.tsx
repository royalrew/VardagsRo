import type { Metadata } from "next";

import { NutritionWorkspace } from "@/components/project100/NutritionWorkspace";
import { minuteOfDayInTimeZone } from "@/lib/dates";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100NutritionView } from "@/server/project100-nutrition";
import { project100NutritionDaySchema } from "@/server/project100-nutrition-schemas";

export const metadata: Metadata = { title: "Kost" };

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function Project100NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{
    dag?: string | string[];
    new?: string | string[];
  }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const query = await searchParams;
  const selected = project100NutritionDaySchema.safeParse({ day: first(query.dag) });
  const view = await loadProject100NutritionView(
    actor,
    selected.success ? selected.data.day : null,
  );
  const requestedComposer = first(query.new);

  return (
    <NutritionWorkspace
      key={`${view.day}:${requestedComposer ?? ""}`}
      initialView={view}
      initialComposer={
        requestedComposer === "meal" || requestedComposer === "batch"
          ? requestedComposer
          : null
      }
      nowMinute={minuteOfDayInTimeZone(new Date(), view.timeZone)}
    />
  );
}
