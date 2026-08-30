import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectAreaScaffold } from "@/components/project100/ProjectAreaScaffold";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";

const areas = {
  jarvis: { eyebrow: "Assistent", title: "Jarvis", description: "En fullstor AI-arbetsyta som känner din historik, ditt jobbschema och dina mål — med synliga källor.", primaryLabel: "Ny konversation", features: [{ title: "Källbunden chatt", detail: "Varje påstående om din resa ska kunna öppna den logg det kommer från." }, { title: "Kontrollerat minne", detail: "Rätta, glöm eller uteslut sådant Jarvis inte ska använda." }, { title: "Granskade handlingar", detail: "Förslag blir strukturerade utkast och sparas först efter godkännande." }], nextSteps: ["Bygga tidslinjen först", "Definiera minnestyper", "Skapa chatt och källpanel"] },
  innehall: { eyebrow: "Skapa", title: "Innehåll", description: "Förvandla valda delar av resan till YouTube-idéer, manus och publicerade berättelser utan att blanda privat och offentligt.", primaryLabel: "Ny idé", features: [{ title: "Produktionsflöde", detail: "Idé, manus, inspelning, redigering och publicering." }, { title: "Godkänt material", detail: "Endast aktivt valda bilder och klipp kan kopplas till ett projekt." }, { title: "Jarvis som redaktör", detail: "Förslag på hook, titel och struktur — aldrig automatisk publicering." }], nextSteps: ["Skapa innehållsprojekt", "Välja material ur mediebiblioteket", "Lägga till manus och statusflöde"] },
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
