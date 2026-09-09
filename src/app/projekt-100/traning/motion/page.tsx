import type { Metadata } from "next";

import { MotionLab } from "@/components/project100/MotionLab";
import { parseMotionMissionLaunch } from "@/lib/motion-mission-launch";
import { generatePairingCode } from "@/lib/motion-remote";
import { assertProject100Adult, requireProject100Actor } from "@/server/project100";

export const metadata: Metadata = { title: "Motion Lab" };

export default async function Project100MotionLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const resolvedParams = await searchParams;
  const launch = parseMotionMissionLaunch(resolvedParams);
  const initialProgram = typeof resolvedParams.program === "string" ? resolvedParams.program : undefined;
  const initialExercise = typeof resolvedParams.exercise === "string" ? resolvedParams.exercise : undefined;
  const initialSource = typeof resolvedParams.source === "string" ? resolvedParams.source : undefined;
  const initialWarmupMissionId = typeof resolvedParams.warmupMission === "string"
    && resolvedParams.warmupMission.length <= 200
    ? resolvedParams.warmupMission
    : undefined;
  const initialPairingCode = generatePairingCode();
  return (
    <MotionLab
      initialMissionLaunch={launch}
      initialProgram={initialProgram}
      initialExercise={initialExercise}
      initialSource={initialSource}
      initialWarmupMissionId={initialWarmupMissionId}
      initialPairingCode={initialPairingCode}
    />
  );
}
