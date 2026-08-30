import type { Metadata } from "next";

import { InsightsWorkspace } from "@/components/project100/InsightsWorkspace";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100Insights } from "@/server/project100-insights";
import { project100InsightsQuerySchema } from "@/server/project100-insights-schemas";

export const metadata: Metadata = {
  title: "Insikter & Utveckling – Projekt 100",
  description: "Tvärfunktionell analys över träning, kost, kropp och återhämtning.",
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function Project100InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);

  const query = await searchParams;
  const parsed = project100InsightsQuerySchema.parse({
    period: first(query.period) ?? "30d",
    from: first(query.from),
    to: first(query.to),
  });

  const insights = await loadProject100Insights(actor, parsed);

  return <InsightsWorkspace insights={insights} />;
}
