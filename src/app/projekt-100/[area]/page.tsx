import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectAreaScaffold } from "@/components/project100/ProjectAreaScaffold";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";

const areas = {
  installningar: { eyebrow: "System", title: "Inställningar", description: "Mål, utrustning, schemapreferenser, integritet och full kontroll över dina personliga data.", primaryLabel: "Spara inställningar", features: [{ title: "Mål och miljö", detail: "Målvikt, delmål, utrustning och träningsplatser." }, { title: "Schema och återhämtning", detail: "Restid, sömnbuffert och realistiska träningsfönster." }, { title: "Dataägande", detail: "Jarvis-behörigheter, export, backup och fullständig radering." }], nextSteps: ["Definiera privata inställningar", "Bygga exportformat", "Införa integritetskontroller"] },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  const config = areas[area as keyof typeof areas];
  return config ? { title: config.title } : {};
}

export default async function Project100AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const { area } = await params;
  const config = areas[area as keyof typeof areas];
  if (!config) notFound();
  return <ProjectAreaScaffold {...config} features={[...config.features]} nextSteps={[...config.nextSteps]} />;
}
