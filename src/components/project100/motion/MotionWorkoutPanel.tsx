"use client";

import {
  Check,
  CircleStop,
  Copy,
  Download,
  Play,
  RotateCcw,
} from "lucide-react";
import React from "react";

import {
  SQUAT_PHASE_LABELS,
  squatTestInstruction,
  type SquatTrackerState,
} from "@/lib/motion-squat";
import {
  getRestSecondsRemaining,
  type WorkoutSessionState,
} from "@/lib/motion-workout";
import { angleDegrees } from "./motion-formatting";

export type RestPreset = "30" | "45" | "60" | "dynamic";

export interface MotionWorkoutPanelProps {
  workoutSession: WorkoutSessionState;
  squatView: SquatTrackerState;
  squatProtocol: "workout-step-31" | "symmetry-step-26" | "tempo-step-25" | "rom-step-24";
  squatTrackingEnabled: boolean;
  restPreset: RestPreset;
  squatReportCopied: boolean;
  nowMs: number;
  onChangeRestPreset: (preset: RestPreset) => void;
  onToggleSquatTracking: () => void;
  onResetSquatTracking: (resetWorkout?: boolean) => void;
  onCopySquatReport: () => Promise<void> | void;
  onDownloadSquatReport: () => void;
  onSkipRest: () => void;
}

/**
 * Sidebar panel for Squat tracking and 3x10 workout sessions, including
 * rest presets, live ROM/joint angles, set logs table, and report export.
 */
export function MotionWorkoutPanel({
  workoutSession,
  squatView,
  squatProtocol,
  squatTrackingEnabled,
  restPreset,
  squatReportCopied,
  nowMs,
  onChangeRestPreset,
  onToggleSquatTracking,
  onResetSquatTracking,
  onCopySquatReport,
  onDownloadSquatReport,
  onSkipRest,
}: MotionWorkoutPanelProps): React.JSX.Element {
  return (
    <section className="p100-motion-panel p100-motion-squat-panel">
      <header>
        <span>Fas D · Coach v1</span>
        <strong>Passmotor · 3×10 Knäböj</strong>
      </header>

      <div className="p100-motion-rest-preset-select">
        <span>Vilotid:</span>
        <div className="p100-motion-rest-preset-buttons">
          <button
            type="button"
            className={restPreset === "30" ? "active" : ""}
            onClick={() => onChangeRestPreset("30")}
            disabled={squatTrackingEnabled}
          >
            30s
          </button>
          <button
            type="button"
            className={restPreset === "45" ? "active" : ""}
            onClick={() => onChangeRestPreset("45")}
            disabled={squatTrackingEnabled}
          >
            45s
          </button>
          <button
            type="button"
            className={restPreset === "60" ? "active" : ""}
            onClick={() => onChangeRestPreset("60")}
            disabled={squatTrackingEnabled}
          >
            60s
          </button>
          <button
            type="button"
            className={restPreset === "dynamic" ? "active" : ""}
            onClick={() => onChangeRestPreset("dynamic")}
            disabled={squatTrackingEnabled}
          >
            Stegvis
          </button>
        </div>
      </div>

      <div className="p100-motion-squat-summary">
        <div>
          <small>Set</small>
          <strong>
            {workoutSession.status === "completed"
              ? "3/3 (Klart!)"
              : `${workoutSession.currentSetIndex + 1}/${workoutSession.config.targetSets}`}
          </strong>
        </div>
        <div>
          <small>{workoutSession.status === "resting" ? "Vila kvar" : "Reps i set"}</small>
          <strong>
            {workoutSession.status === "resting"
              ? `${getRestSecondsRemaining(workoutSession, nowMs)}s`
              : `${squatView.reps}/${workoutSession.config.targetRepsPerSet}`}
          </strong>
        </div>
        <div>
          <small>Status</small>
          <strong>
            {workoutSession.status === "resting"
              ? "Vila"
              : workoutSession.status === "completed"
              ? "Pass slutfört"
              : squatView.tracking
              ? SQUAT_PHASE_LABELS[squatView.phase]
              : "Väntar på pose"}
          </strong>
        </div>
      </div>

      <div className="p100-motion-squat-rom-live">
        <div className="p100-motion-squat-rom-header">
          <span>Momentan ROM</span>
          <strong>
            {squatView.currentRomPercent}%{" "}
            {squatView.currentRomPercent >= 85
              ? "(Fullt djup)"
              : squatView.currentRomPercent >= 45
              ? "(Halv böj)"
              : ""}
          </strong>
        </div>
        <progress
          value={Math.min(100, squatView.currentRomPercent)}
          max={100}
          className={
            squatView.currentRomPercent >= 85
              ? "rom-full"
              : squatView.currentRomPercent >= 45
              ? "rom-half"
              : ""
          }
        />
      </div>

      <dl className="p100-motion-squat-angles">
        <div><dt>Höft</dt><dd>{angleDegrees(squatView.measurement.hip)}</dd></div>
        <div><dt>Knä</dt><dd>{angleDegrees(squatView.measurement.knee)}</dd></div>
        <div><dt>Fotled</dt><dd>{angleDegrees(squatView.measurement.ankle)}</dd></div>
        <div>
          <dt>Lårlängd</dt>
          <dd>
            {squatView.standingThighLength
              ? (squatView.standingThighLength * 100).toFixed(1) + " rel"
              : "Mäter…"}
          </dd>
        </div>
        <div><dt>Vänster knä</dt><dd>{angleDegrees(squatView.measurement.left?.knee ?? null)}</dd></div>
        <div><dt>Höger knä</dt><dd>{angleDegrees(squatView.measurement.right?.knee ?? null)}</dd></div>
        <div><dt>Spårade sidor</dt><dd>{squatView.measurement.trackedSides}/2</dd></div>
      </dl>

      {squatView.lastRep ? (
        <div className="p100-motion-squat-last">
          <p>
            Senaste rep:{" "}
            <span
              className={`p100-motion-badge ${
                squatView.lastRep.classification === "full" ? "badge-full" : "badge-half"
              }`}
            >
              {squatView.lastRep.classification === "full" ? "FULL" : "HALV"}
            </span>{" "}
            {(squatView.lastRep.durationMs / 1_000).toFixed(1)} s · botten{" "}
            {Math.round(squatView.lastRep.minimumKneeAngle)}° (ROM {squatView.lastRep.romPercent}%)
          </p>
          {squatView.lastRep.tempo ? (
            <p className="p100-motion-tempo-breakdown">
              <strong>Tempo {squatView.lastRep.tempo.notation}</strong>:{" "}
              {(squatView.lastRep.tempo.eccentricMs / 1000).toFixed(1)}s ned ·{" "}
              {(squatView.lastRep.tempo.bottomMs / 1000).toFixed(1)}s botten ·{" "}
              {(squatView.lastRep.tempo.concentricMs / 1000).toFixed(1)}s upp
            </p>
          ) : null}
          {squatView.lastRep.symmetry ? (
            <p className="p100-motion-symmetry-breakdown">
              <strong>Balans {squatView.lastRep.symmetry.symmetryScore}%</strong>:{" "}
              {squatView.lastRep.symmetry.observation} (Δknä{" "}
              {squatView.lastRep.symmetry.kneeAngleDiff}°)
            </p>
          ) : null}
        </div>
      ) : (
        <p className="p100-motion-squat-last">
          Ställ dig så hela kroppen syns. Gör 10 repetitioner per set. Systemet räknar, coachar och sköter vilan automatiskt.
        </p>
      )}

      {squatProtocol === "workout-step-31" && workoutSession.status === "resting" ? (
        <div className="p100-motion-workout-rest-actions">
          <button
            type="button"
            className="p100-motion-btn p100-motion-btn-skip-rest"
            onClick={onSkipRest}
          >
            <Play /> Hoppa över vila och starta Set {workoutSession.currentSetIndex + 1}
          </button>
        </div>
      ) : null}

      {squatProtocol === "workout-step-31" && workoutSession.completedSets.length > 0 ? (
        <div className="p100-motion-workout-sets-log">
          <header className="p100-motion-workout-sets-header">
            <span>Slutförda set</span>
            <strong>
              {workoutSession.completedSets.length} av {workoutSession.config.targetSets}
            </strong>
          </header>
          <div className="p100-motion-workout-table-wrapper">
            <table className="p100-motion-workout-sets-table">
              <thead>
                <tr>
                  <th>Set</th>
                  <th>Reps</th>
                  <th>Full/Halv</th>
                  <th>ROM</th>
                  <th>Tempo</th>
                  <th>Tid</th>
                </tr>
              </thead>
              <tbody>
                {workoutSession.completedSets.map((s) => (
                  <tr key={s.setNumber}>
                    <td>Set {s.setNumber}</td>
                    <td>
                      <strong>{s.completedReps}</strong>/{s.targetReps}
                    </td>
                    <td>
                      {s.fullReps}/{s.halfReps}
                    </td>
                    <td>{s.averageRomPercent}%</td>
                    <td>{s.averageTempoNotation ?? "—"}</td>
                    <td>{(s.durationMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="p100-motion-squat-protocol">{squatTestInstruction(squatView, squatProtocol)}</p>
      <p className="p100-motion-squat-signal">
        Signal {squatView.samples === 0 ? 0 : Math.round((squatView.trackedSamples / squatView.samples) * 100)}%
        {" · "}båda sidor {squatView.samples === 0 ? 0 : Math.round((squatView.bothSidesSamples / squatView.samples) * 100)}%
      </p>
      <div className="p100-motion-squat-actions">
        <button
          type="button"
          className={squatTrackingEnabled ? "active" : ""}
          onClick={onToggleSquatTracking}
        >
          {squatTrackingEnabled ? <CircleStop /> : <Play />}{" "}
          {squatTrackingEnabled
            ? (squatProtocol === "workout-step-31" ? "Stoppa pass" : "Stoppa test")
            : squatProtocol === "workout-step-31"
            ? "Starta pass (3×10)"
            : squatProtocol === "symmetry-step-26"
            ? "Starta symmetritest"
            : squatProtocol === "tempo-step-25"
            ? "Starta tempo-test"
            : "Starta squat-test"}
        </button>
        <button
          type="button"
          onClick={() => onResetSquatTracking(true)}
          disabled={!squatTrackingEnabled && squatView.reps === 0 && workoutSession.completedSets.length === 0}
        >
          <RotateCcw /> Nollställ
        </button>
        <button
          type="button"
          className="copy"
          onClick={() => void onCopySquatReport()}
          disabled={squatView.samples === 0 && workoutSession.completedSets.length === 0}
        >
          {squatReportCopied ? <Check /> : <Copy />}{" "}
          {squatReportCopied
            ? "Kopierad"
            : squatProtocol === "workout-step-31"
            ? "Kopiera passrapport"
            : "Kopiera rapport"}
        </button>
        <button
          type="button"
          className="download"
          onClick={onDownloadSquatReport}
          disabled={squatView.samples === 0 && workoutSession.completedSets.length === 0}
        >
          <Download /> Ladda ned .json
        </button>
      </div>
    </section>
  );
}
