import type { Metadata } from "next";

import { MotionLab } from "@/components/project100/MotionLab";
import { parseMotionMissionLaunch } from "@/lib/motion-mission-launch";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";

export const metadata: Metadata = { title: "Motion Lab" };

export default async function Project100MotionLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const launch = parseMotionMissionLaunch(await searchParams);
  return <MotionLab initialMissionLaunch={launch} />;
}
