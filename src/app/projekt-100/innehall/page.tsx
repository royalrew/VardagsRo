import type { Metadata } from "next";

import { ContentWorkspace } from "@/components/project100/ContentWorkspace";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100ContentWorkspace } from "@/server/project100-content";

export const metadata: Metadata = {
  title: "Innehåll & YouTube – Projekt 100",
  description: "Bygg manus, scener och videoidéer baserade på din verkliga träningsresa utan att blanda privat och offentligt.",
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function Project100ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);

  const query = await searchParams;
  const projectId = first(query.id);

  const workspace = await loadProject100ContentWorkspace(actor, projectId);

  return <ContentWorkspace {...workspace} />;
}
