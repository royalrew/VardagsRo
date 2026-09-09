"use client";

import { Check, Clock3, MapPin, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TrainingBlockPlanner } from "./TrainingBlockPlanner";
import { TrainingStimulusPanel } from "./TrainingStimulusPanel";

import type {
  Project100ExercisePurpose,
  Project100MissionType,
  Project100MovementPattern,
  Project100ObservationLevel,
  Project100TrainingEnvironment,
  Project100TrainingSource,
} from "@/lib/project100-training-mission";
import type { Project100TrainingStimulusAssessment } from "@/lib/project100-training-stimulus";

export interface DailyMissionView {
  id: string;
  title: string;
  missionType: Project100MissionType;
  status: "planned" | "in_progress" | "completed" | "skipped";
  sessionDate: string;
  durationSeconds: number;
  coverage: {
    percentage: number;
    completedTargetSets: number;
    targetSets: number;
    requirements: Array<{
      movementPattern: Project100MovementPattern;
      label: string;
      targetSets: number;
      targetReps: number;
      completedSets: number;
      remainingSets: number;
    }>;
  };
  stimulus: Project100TrainingStimulusAssessment;
  dataGaps: string[];
  blocks: Array<{
    id: string;
    startedAt: string;
    endedAt: string;
    activeSeconds: number;
    environment: Project100TrainingEnvironment;
    location: string | null;
    source: Project100TrainingSource;
    sets: Array<{
      id: string;
      exerciseName: string;
      movementPattern: Project100MovementPattern | null;
      purpose: Project100ExercisePurpose | null;
      reps: number | null;
      durationSeconds: number | null;
      rpe: number | null;
      observationLevel: Project100ObservationLevel | null;
      romConfidence: number | null;
    }>;
  }>;
}

const environmentLabels: Record<Project100TrainingEnvironment, string> = {
  home: "Hemma",
  outdoor_gym: "Utegym",
  grass: "Gräsmatta",
  forest: "Skog",
  gym: "Gym",
  other: "Annan plats",
};

const sourceLabels: Record<Project100TrainingSource, string> = {
  motion: "Motion Lab",
  jarvis: "Jarvis",
  manual: "Manuellt",
};

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    if (typeof error === "string") return error;
  }
  return fallback;
}

function formatBlockTime(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

export function DailyTrainingMission({
  today,
  initialMission,
}: {
  today: string;
  initialMission: DailyMissionView | null;
}) {
  const router = useRouter();
  const [mission, setMission] = useState(initialMission);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);

  async function start(missionType: Project100MissionType) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project100/training/mission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionType, sessionDate: today }),
      });
      const body = (await response.json()) as { mission?: DailyMissionView; error?: unknown };
      if (!response.ok || !body.mission) throw new Error(errorMessage(body, "Uppdraget kunde inte startas."));
      setMission(body.mission);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Uppdraget kunde inte startas.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!mission || mission.status !== "in_progress") return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/project100/training/mission/${encodeURIComponent(mission.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ effort: null, bodyAfter: null, notes: null }),
        },
      );
      const body = (await response.json()) as { mission?: DailyMissionView; error?: unknown };
      if (!response.ok || !body.mission) throw new Error(errorMessage(body, "Uppdraget kunde inte avslutas."));
      setMission(body.mission);
      setConfirmFinish(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Uppdraget kunde inte avslutas.");
    } finally {
      setBusy(false);
    }
  }

  async function reloadMission() {
    const response = await fetch(`/api/project100/training/mission?date=${encodeURIComponent(today)}`);
    const body = (await response.json()) as { mission?: DailyMissionView | null; error?: unknown };
    if (!response.ok || !body.mission) throw new Error(errorMessage(body, "Uppdraget kunde inte uppdateras."));
    setMission(body.mission);
    router.refresh();
  }

  return (
    <section className="p100-daily-mission" aria-labelledby="daily-mission-title">
      <header>
        <div>
          <span>Dagens pass</span>
          <h2 id="daily-mission-title">{mission?.title ?? "Vad vill du träna idag?"}</h2>
          <p>
            {mission?.status === "completed"
              ? "Passet är avslutat. Du hittar dina genomförda set och framsteg nedan."
              : mission
              ? "Värm upp och fortsätt med nästa övning. Dina sparade set finns kvar om du tar en paus."
              : "Börja med spinning och fortsätt sedan med överkropp eller underkropp."}
          </p>
        </div>
        {mission ? (
          <div className="p100-mission-score" aria-label={`${mission.coverage.percentage} procent genomfört`}>
            <strong>{mission.coverage.percentage}%</strong>
            <small>av planen klart</small>
          </div>
        ) : null}
      </header>

      {!mission ? (
        <div className="p100-mission-start">
          <button type="button" disabled={busy} onClick={() => start("upper")}>
            <Play /> Starta överkropp
          </button>
          <button type="button" disabled={busy} onClick={() => start("lower")}>
            <Play /> Starta underkropp
          </button>
        </div>
      ) : (
        <>
          <div className="p100-mission-progress" aria-hidden="true">
            <i style={{ width: `${mission.coverage.percentage}%` }} />
          </div>
          {mission.status === "in_progress" ? (
            <TrainingBlockPlanner
              key={mission.id}
              missionId={mission.id}
              missionType={mission.missionType}
              requirements={mission.coverage.requirements}
              onSaved={reloadMission}
            />
          ) : null}

          <details className="p100-block-details">
            <summary>Visa passets framsteg och träningsanalys</summary>
          <div className="p100-mission-patterns">
            {mission.coverage.requirements.map((requirement) => (
              <article key={requirement.movementPattern} data-complete={requirement.remainingSets === 0}>
                <span>{requirement.remainingSets === 0 ? <Check /> : requirement.completedSets}</span>
                <div>
                  <strong>{requirement.label}</strong>
                  <small>
                    {requirement.remainingSets === 0
                      ? "Klar"
                      : `${requirement.remainingSets} av ${requirement.targetSets} set återstår`}
                  </small>
                </div>
              </article>
            ))}
          </div>

          <TrainingStimulusPanel assessment={mission.stimulus} />

          {mission.blocks.length > 0 ? (
            <div className="p100-mission-blocks">
              <h3>Registrerade block</h3>
              {mission.blocks.map((block) => (
                <article key={block.id}>
                  <span><Clock3 /></span>
                  <div>
                    <strong>{sourceLabels[block.source]} · {block.sets.length} set</strong>
                    <small>
                      {formatBlockTime(block.startedAt)} · {Math.round(block.activeSeconds / 60)} min
                    </small>
                  </div>
                  <em><MapPin /> {block.location ?? environmentLabels[block.environment]}</em>
                </article>
              ))}
            </div>
          ) : (
            <p className="p100-mission-empty">Dina genomförda set visas här när du sparar dem.</p>
          )}

          </details>

          <footer>
            <span>
              {mission.status === "completed"
                ? `Avslutat med ${mission.coverage.completedTargetSets} av ${mission.coverage.targetSets} målset.`
                : `${mission.coverage.completedTargetSets} av ${mission.coverage.targetSets} målset gjorda.`}
              {mission.dataGaps.includes("rpe_missing") ? " Ansträngning saknas för vissa set." : ""}
            </span>
            {mission.status === "in_progress" ? (
              confirmFinish ? (
                <div className="p100-mission-finish-confirm" role="group" aria-label="Bekräfta att dagens uppdrag ska avslutas">
                  <strong>{mission.coverage.targetSets - mission.coverage.completedTargetSets} målset återstår.</strong>
                  <button type="button" disabled={busy} onClick={() => setConfirmFinish(false)}>Fortsätt träna</button>
                  <button type="button" disabled={busy} onClick={() => void finish()}><Square /> Avsluta ändå</button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (mission.coverage.completedTargetSets < mission.coverage.targetSets) {
                      setConfirmFinish(true);
                    } else {
                      void finish();
                    }
                  }}
                >
                  <Square /> Avsluta passet
                </button>
              )
            ) : null}
          </footer>
        </>
      )}
      {error ? <p className="p100-form-error" role="alert">{error}</p> : null}
    </section>
  );
}
