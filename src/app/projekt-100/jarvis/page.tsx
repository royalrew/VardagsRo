import type { Metadata } from "next";

import { JarvisWorkspace } from "@/components/project100/JarvisWorkspace";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";
import { loadProject100JarvisWorkspace } from "@/server/project100-jarvis";

export const metadata: Metadata = {
  title: "Jarvis AI – Projekt 100",
  description: "Personlig assistent med källbunden historik, jobbschema och kontrollerat minne.",
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function Project100JarvisPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);

  const query = await searchParams;
  const conversationId = first(query.c);

  const workspace = await loadProject100JarvisWorkspace(actor, conversationId);

  return <JarvisWorkspace {...workspace} />;
}
