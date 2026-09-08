import type { Metadata } from "next";

import { TrainingWorkspace } from "@/components/project100/TrainingWorkspace";
import { formatCompactDate, formatTimeRange } from "@/lib/dates";
import {
  assertProject100Adult,
  loadProject100WorkSchedule,
  nextProject100WorkEvent,
  requireProject100Actor,
} from "@/server/project100";
import { loadProject100TrainingView } from "@/server/project100-training";
import {
  loadProject100DailyTrainingMission,
  loadProject100TrainingLiveGate,
} from "@/server/project100-training-missions";

export const metadata: Metadata = { title: "Träning" };

export default async function Project100TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string | string[] }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const [schedule, training, mission, liveGate, query] = await Promise.all([
    loadProject100WorkSchedule(actor),
    loadProject100TrainingView(actor),
    loadProject100DailyTrainingMission(actor),
    loadProject100TrainingLiveGate(actor),
    searchParams,
  ]);
  const nextWork = nextProject100WorkEvent(schedule);
  const nextWorkLabel = nextWork
    ? `${nextWork.title} · ${formatCompactDate(nextWork.startsAt)} · ${formatTimeRange(
        nextWork.startsAt,
        nextWork.endsAt,
        nextWork.allDay,
        schedule.timeZone,
      )}`
    : null;
  const initialComposer = query.new === "template" ? "template" : query.new === "session" ? "session" : null;

  return (
    <TrainingWorkspace
      initialView={training}
      initialMission={mission}
      initialLiveGate={liveGate}
      nextWorkLabel={nextWorkLabel}
      initialComposer={initialComposer}
    />
  );
}
