"use client";

import { CheckCircle2, Database, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  buildMotionMissionBlockInput,
  type MotionMissionLaunch,
} from "@/lib/motion-mission-launch";
import type { TrackableExerciseId } from "@/lib/motion-library";
import {
  cameraSetupRomConfidence,
  type SavedCameraSetupProfile,
} from "@/lib/motion-adaptive-camera";

export function MotionMissionSyncPanel({
  launch,
  activeExerciseId,
  measuredReps,
  measuredHoldSeconds,
  trackingEnabled,
  cameraSetupProfile,
  onSetSaved,
}: {
  launch: MotionMissionLaunch;
  activeExerciseId: TrackableExerciseId | null;
  measuredReps: number;
  measuredHoldSeconds: number;
  trackingEnabled: boolean;
  cameraSetupProfile: SavedCameraSetupProfile | null;
  onSetSaved: () => void;
}) {
  const [rpe, setRpe] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSets, setSavedSets] = useState(0);
  const eventIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (trackingEnabled && startedAtRef.current === null) {
      startedAtRef.current = new Date().toISOString();
    }
  }, [trackingEnabled]);

  const exerciseMatches = activeExerciseId === launch.exerciseId;
  const isHold = launch.exerciseId === "plank";
  const measuredValue = isHold ? Math.floor(measuredHoldSeconds) : measuredReps;
  const targetValue = isHold ? launch.targetDurationSeconds ?? 30 : launch.targetReps;

  async function saveMotionSet() {
    if (!exerciseMatches || measuredValue <= 0) return;
    const parsedRpe = rpe.trim() ? Number(rpe.replace(",", ".")) : null;
    if (parsedRpe !== null && (!Number.isFinite(parsedRpe) || parsedRpe < 1 || parsedRpe > 10)) {
      setError("RPE måste vara mellan 1 och 10.");
      return;
    }

    const endedAt = new Date().toISOString();
    const startedAt = startedAtRef.current ?? endedAt;
    const sourceEventId = eventIdRef.current ?? `motion-set-${crypto.randomUUID()}`;
    eventIdRef.current = sourceEventId;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/project100/training/mission/${encodeURIComponent(launch.missionId)}/blocks`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildMotionMissionBlockInput(launch, {
            reps: measuredReps,
            holdSeconds: measuredHoldSeconds,
            rpe: parsedRpe,
            startedAt,
            endedAt,
            sourceEventId,
            setupProfileId: cameraSetupProfile?.id ?? null,
            observationLevel: cameraSetupProfile?.observationLevel ?? "manual",
            romConfidence: cameraSetupRomConfidence(cameraSetupProfile),
          })),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; details?: string } | null;
        throw new Error(body?.details ?? body?.error ?? "Motion-setet kunde inte sparas.");
      }
      eventIdRef.current = null;
      startedAtRef.current = new Date().toISOString();
      setRpe("");
      setSavedSets((current) => current + 1);
      onSetSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Motion-setet kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="p100-motion-mission-sync" data-matches={exerciseMatches}>
      <header>
        <div>
          <span><Database /> Dagens uppdrag · exakt en gång</span>
          <strong>{launch.exerciseName}</strong>
          <small>{launch.environment.replace("_", " ")} · mål {targetValue} {isHold ? "sekunder" : "reps"}{launch.weightKg !== null ? ` · ${launch.weightKg.toLocaleString("sv-SE")} kg` : ""} · {cameraSetupProfile ? "repräkning" : "manuell observationsnivå"}</small>
        </div>
        {savedSets > 0 ? <em><CheckCircle2 /> {savedSets} set sparat</em> : null}
      </header>

      {!exerciseMatches ? (
        <p>Välj {launch.exerciseName} i övningspanelen för att aktivera synkningen.</p>
      ) : (
        <div className="p100-motion-mission-actions">
          <div>
            <span>Motion har registrerat</span>
            <strong>{measuredValue} / {targetValue} {isHold ? "sek" : "reps"}</strong>
          </div>
          <label>
            <span>RPE 1–10</span>
            <input inputMode="decimal" value={rpe} onChange={(event) => setRpe(event.target.value)} placeholder="valfritt" />
          </label>
          <button type="button" disabled={saving || measuredValue <= 0} onClick={saveMotionSet}>
            <Database /> {saving ? "Sparar…" : "Avsluta och spara set"}
          </button>
        </div>
      )}
      {error ? <p className="p100-form-error" role="alert">{error}</p> : null}
      <footer>
        <span>Ett nytt käll-id skapas per set. Samma försök kan skickas igen utan dubbelräkning.</span>
        <Link href="/projekt-100/traning"><RotateCcw /> Till dagens uppdrag</Link>
      </footer>
    </section>
  );
}
