import type { Metadata } from "next";
import { GardenWorkspace } from "@/components/project100/GardenWorkspace";
import { accessGarden } from "@/server/garden";
import { requireProject100Actor } from "@/server/project100";

export const metadata: Metadata = { title: "Min trädgård" };

export default async function GardenPage() {
  const actor = await requireProject100Actor();
  return <GardenWorkspace initialView={await accessGarden(actor)} />;
}
