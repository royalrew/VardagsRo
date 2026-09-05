import type { Metadata } from "next";

import { MotionLab } from "@/components/project100/MotionLab";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";

export const metadata: Metadata = { title: "Motion Lab" };

export default async function Project100MotionLabPage() {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  return <MotionLab />;
}
