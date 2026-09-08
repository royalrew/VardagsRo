"use client";

import {
  Camera,
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
import type { CoachSettings, MotionCoachMemory } from "@/lib/motion-coach";
import {
  getRestSecondsRemaining,
  type WorkoutSessionState,
} from "@/lib/motion-workout";
import {
  getExerciseCameraGuidance,
  type ExerciseType,
} from "@/lib/motion-exercises";
import {
  EXERCISE_LIBRARY,
  getLibraryCameraGuidance,
  type TrackableExerciseId,
} from "@/lib/motion-library";
import {
  WORKOUT_PROGRAMS,
  type ProgramId,
} from "@/lib/motion-programs";
import type { ExerciseFramingFeedback } from "@/lib/motion-camera-coach";
import { angleDegrees } from "./motion-formatting";

export type RestPreset = "30" | "45" | "60" | "dynamic";
export type WorkoutPanelSelection = ExerciseType | TrackableExerciseId | "circuit" | ProgramId;

export interface MotionWorkoutPanelProps {
  workoutSession: WorkoutSessionState;
  squatView: SquatTrackerState;
  squatProtocol: "workout-step-31" | "symmetry-step-26" | "tempo-step-25" | "rom-step-24";
  squatTrackingEnabled: boolean;
  restPreset: RestPreset;
  coachSettings: CoachSettings;
  coachMemory?: MotionCoachMemory;
  squatReportCopied: boolean;
  nowMs: number;
  activeExercise?: WorkoutPanelSelection;
  onChangeExercise?: (exercise: WorkoutPanelSelection) => void;
  onChangeRestPreset: (preset: RestPreset) => void;
  onChangeCoachSettings: (next: CoachSettings) => void;
  onToggleSquatTracking: () => void;
  onResetSquatTracking: (resetWorkout?: boolean) => void;
  onCopySquatReport: () => Promise<void> | void;
  onDownloadSquatReport: () => void;
  onSkipRest: () => void;
  onRecordRpe?: (setIndex: number, rpe: "easy" | "moderate" | "hard") => void;
  framingFeedback?: ExerciseFramingFeedback | null;
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
  coachSettings,
  coachMemory,
  squatReportCopied,
  nowMs,
  activeExercise = "squat",
  onChangeExercise,
  onChangeRestPreset,
  onChangeCoachSettings,
  onToggleSquatTracking,
  onResetSquatTracking,
  onCopySquatReport,
  onDownloadSquatReport,
  onSkipRest,
  onRecordRpe,
  framingFeedback,
}: MotionWorkoutPanelProps): React.JSX.Element {
  const [filterCategory, setFilterCategory] = React.useState<
    "all" | "bodyweight" | "dumbbell" | "kettlebell" | "programs"
  >("all");

  const libraryExerciseId = activeExercise as TrackableExerciseId;
  const libraryItem = EXERCISE_LIBRARY[libraryExerciseId];
  const programItem = WORKOUT_PROGRAMS[activeExercise as ProgramId];

  const cameraGuidance = libraryItem
    ? getLibraryCameraGuidance(libraryExerciseId)
    : activeExercise && activeExercise !== "circuit"
    ? getExerciseCameraGuidance(activeExercise as ExerciseType)
    : getExerciseCameraGuidance("squat");

  const displayTitle = programItem
    ? `Program · ${programItem.title}`
    : libraryItem
    ? `Övning · ${libraryItem.name} (${libraryItem.equipment})`
    : activeExercise === "circuit"
    ? "Passmotor · 15 min Helkropp Cirkel"
    : "Passmotor · 3×10 Knäböj";

  return (
    <section className="p100-motion-panel p100-motion-squat-panel">
      <header>
        <span>Fas H & Bibliotek · Styrka & Program</span>
        <strong>{displayTitle}</strong>
      </header>

      {/* Övningsbibliotek & Programväljare */}
      {onChangeExercise && (
        <div className="p100-motion-exercise-picker">
          <label>Övningsbibliotek & Muskelprogram</label>
          <div className="p100-motion-category-tabs" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button
              type="button"
              className={filterCategory === "all" ? "active" : ""}
              onClick={() => setFilterCategory("all")}
              style={{ padding: "3px 7px", fontSize: "0.48rem" }}
            >
              Alla
            </button>
            <button
              type="button"
              className={filterCategory === "dumbbell" ? "active" : ""}
              onClick={() => setFilterCategory("dumbbell")}
              style={{ padding: "3px 7px", fontSize: "0.48rem" }}
            >
              🏋️ Hantlar
            </button>
            <button
              type="button"
              className={filterCategory === "kettlebell" ? "active" : ""}
              onClick={() => setFilterCategory("kettlebell")}
              style={{ padding: "3px 7px", fontSize: "0.48rem" }}
            >
              🔔 Kettlebell
            </button>
            <button
              type="button"
              className={filterCategory === "bodyweight" ? "active" : ""}
              onClick={() => setFilterCategory("bodyweight")}
              style={{ padding: "3px 7px", fontSize: "0.48rem" }}
            >
              🤸 Kroppsvikt
            </button>
            <button
              type="button"
              className={filterCategory === "programs" ? "active" : ""}
              onClick={() => setFilterCategory("programs")}
              style={{ padding: "3px 7px", fontSize: "0.48rem" }}
            >
              📋 Program
            </button>
          </div>

          <div className="p100-motion-exercise-buttons">
            {/* Programs view */}
            {(filterCategory === "programs" || filterCategory === "all") && (
              <>
                <button
                  type="button"
                  className={activeExercise === "push-power" ? "active" : ""}
                  onClick={() => onChangeExercise("push-power")}
                  disabled={squatTrackingEnabled}
                >
                  ⚡ Push & Press (Bröst/Axlar)
                </button>
                <button
                  type="button"
                  className={activeExercise === "pull-biceps" ? "active" : ""}
                  onClick={() => onChangeExercise("pull-biceps")}
                  disabled={squatTrackingEnabled}
                >
                  ⚡ Pull & Biceps (Rygg/Armar)
                </button>
                <button
                  type="button"
                  className={activeExercise === "legs-foundation" ? "active" : ""}
                  onClick={() => onChangeExercise("legs-foundation")}
                  disabled={squatTrackingEnabled}
                >
                  ⚡ Legs & Lower (Ben/Säte)
                </button>
                <button
                  type="button"
                  className={activeExercise === "kettlebell-blast" ? "active" : ""}
                  onClick={() => onChangeExercise("kettlebell-blast")}
                  disabled={squatTrackingEnabled}
                >
                  ⚡ Kettlebell Blast
                </button>
                <button
                  type="button"
                  className={activeExercise === "calisthenics-control" ? "active" : ""}
                  onClick={() => onChangeExercise("calisthenics-control")}
                  disabled={squatTrackingEnabled}
                >
                  ⚡ Calisthenics & Handstand
                </button>
                <button
                  type="button"
                  className={activeExercise === "circuit" ? "active" : ""}
                  onClick={() => onChangeExercise("circuit")}
                  disabled={squatTrackingEnabled}
                >
                  ⚡ 15m Cirkel
                </button>
              </>
            )}

            {/* Dumbbells view */}
            {(filterCategory === "dumbbell" || filterCategory === "all") && (
              <>
                <button
                  type="button"
                  className={activeExercise === "bicep-curl" ? "active" : ""}
                  onClick={() => onChangeExercise("bicep-curl")}
                  disabled={squatTrackingEnabled}
                >
                  Bicepscurl (Hantel)
                </button>
                <button
                  type="button"
                  className={activeExercise === "overhead-press" ? "active" : ""}
                  onClick={() => onChangeExercise("overhead-press")}
                  disabled={squatTrackingEnabled}
                >
                  Axelpress (Hantel)
                </button>
                <button
                  type="button"
                  className={activeExercise === "lateral-raise" ? "active" : ""}
                  onClick={() => onChangeExercise("lateral-raise")}
                  disabled={squatTrackingEnabled}
                >
                  Sidolyft (Hantel)
                </button>
                <button
                  type="button"
                  className={activeExercise === "bent-over-row" ? "active" : ""}
                  onClick={() => onChangeExercise("bent-over-row")}
                  disabled={squatTrackingEnabled}
                >
                  Hantelrodd
                </button>
                <button
                  type="button"
                  className={activeExercise === "dumbbell-rdl" ? "active" : ""}
                  onClick={() => onChangeExercise("dumbbell-rdl")}
                  disabled={squatTrackingEnabled}
                >
                  Hantel-RDL
                </button>
              </>
            )}

            {/* Kettlebells view */}
            {(filterCategory === "kettlebell" || filterCategory === "all") && (
              <>
                <button
                  type="button"
                  className={activeExercise === "kettlebell-swing" ? "active" : ""}
                  onClick={() => onChangeExercise("kettlebell-swing")}
                  disabled={squatTrackingEnabled}
                >
                  Kettlebellsving
                </button>
                <button
                  type="button"
                  className={activeExercise === "goblet-squat" ? "active" : ""}
                  onClick={() => onChangeExercise("goblet-squat")}
                  disabled={squatTrackingEnabled}
                >
                  Goblet Squat
                </button>
              </>
            )}

            {/* Bodyweight / Calisthenics view */}
            {(filterCategory === "bodyweight" || filterCategory === "all") && (
              <>
                <button
                  type="button"
                  className={activeExercise === "squat" ? "active" : ""}
                  onClick={() => onChangeExercise("squat")}
                  disabled={squatTrackingEnabled}
                >
                  Knäböj
                </button>
                <button
                  type="button"
                  className={activeExercise === "pushup" ? "active" : ""}
                  onClick={() => onChangeExercise("pushup")}
                  disabled={squatTrackingEnabled}
                >
                  Armhävningar
                </button>
                <button
                  type="button"
                  className={activeExercise === "lunge" ? "active" : ""}
                  onClick={() => onChangeExercise("lunge")}
                  disabled={squatTrackingEnabled}
                >
                  Utfall
                </button>
                <button
                  type="button"
                  className={activeExercise === "bulgarian-split-squat" ? "active" : ""}
                  onClick={() => onChangeExercise("bulgarian-split-squat")}
                  disabled={squatTrackingEnabled}
                >
                  Bulgariska utfall
                </button>
                <button
                  type="button"
                  className={activeExercise === "handstand-hold" ? "active" : ""}
                  onClick={() => onChangeExercise("handstand-hold")}
                  disabled={squatTrackingEnabled}
                >
                  🤸 Handstående
                </button>
                <button
                  type="button"
                  className={activeExercise === "pike-pushup" ? "active" : ""}
                  onClick={() => onChangeExercise("pike-pushup")}
                  disabled={squatTrackingEnabled}
                >
                  Pik-armhävning
                </button>
                <button
                  type="button"
                  className={activeExercise === "bench-dips" ? "active" : ""}
                  onClick={() => onChangeExercise("bench-dips")}
                  disabled={squatTrackingEnabled}
                >
                  Bänk-dips (valfri)
                </button>
                <button
                  type="button"
                  className={activeExercise === "calf-raise" ? "active" : ""}
                  onClick={() => onChangeExercise("calf-raise")}
                  disabled={squatTrackingEnabled}
                >
                  Tåhävningar
                </button>
                <button
                  type="button"
                  className={activeExercise === "plank" ? "active" : ""}
                  onClick={() => onChangeExercise("plank")}
                  disabled={squatTrackingEnabled}
                >
                  Planka
                </button>
                <button
                  type="button"
                  className={activeExercise === "jumping-jacks" ? "active" : ""}
                  onClick={() => onChangeExercise("jumping-jacks")}
                  disabled={squatTrackingEnabled}
                >
                  Jacks
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Steg 76: Kameraguide per övning */}
      {cameraGuidance && (
        <div className="p100-motion-camera-guidance">
          <div className="p100-motion-camera-guidance-badge">
            <Camera className="w-3 h-3" />
            <span>
              {cameraGuidance.angle === "side"
                ? "Sidovy (90° profil)"
                : cameraGuidance.angle === "front-or-45"
                ? "Framifrån / 45°"
                : "Frontvy"}
            </span>
          </div>
          <p className="p100-motion-camera-guidance-text">
            {cameraGuidance.instruction}
          </p>
          {cameraGuidance.warningNotice && (
            <span className="p100-motion-camera-guidance-warn">
              👉 {cameraGuidance.warningNotice}
            </span>
          )}
        </div>
      )}

      {/* Steg 80: Live Kameravinkel & Höjdtolerans (Coach-status) */}
      {framingFeedback && (
        <div
          className={`p100-motion-camera-guidance ${framingFeedback.isOptimal ? "optimal" : "warning"}`}
          style={{
            borderColor: framingFeedback.isOptimal ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.4)",
            background: framingFeedback.isOptimal ? "rgba(6,32,22,0.6)" : "rgba(30,18,4,0.7)",
          }}
        >
          <div className="p100-motion-camera-guidance-badge">
            <span style={{ fontSize: "0.85rem" }}>{framingFeedback.isOptimal ? "📐" : "⚠️"}</span>
            <span style={{ color: framingFeedback.isOptimal ? "#a7f3d0" : "#fef08a" }}>
              {framingFeedback.badgeLabel}
            </span>
          </div>
          <p className="p100-motion-camera-guidance-text" style={{ color: framingFeedback.isOptimal ? "#d1fae5" : "#fef9c3" }}>
            {framingFeedback.advice}
          </p>
        </div>
      )}

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

      {/* Steg 41: Coachprofiler (Tonläge) */}
      <div className="p100-motion-coach-persona-picker">
        <label>Coachprofil (Tonläge)</label>
        <div className="p100-motion-coach-persona-buttons">
          <button
            type="button"
            className={coachSettings.tone === "calm" ? "active" : ""}
            onClick={() => onChangeCoachSettings({ ...coachSettings, tone: "calm" })}
            title="Lugn: mjukare ton, fokus på andning och hållning"
          >
            Lugn
          </button>
          <button
            type="button"
            className={coachSettings.tone === "motivational" ? "active" : ""}
            onClick={() => onChangeCoachSettings({ ...coachSettings, tone: "motivational" })}
            title="Peppande: energisk, driven och firar prestation"
          >
            Peppande
          </button>
          <button
            type="button"
            className={coachSettings.tone === "analytical" ? "active" : ""}
            onClick={() => onChangeCoachSettings({ ...coachSettings, tone: "analytical" })}
            title="Analytisk: redovisar vinklar, ROM % och millisekunder"
          >
            Analytisk
          </button>
        </div>
      </div>

      <label className="p100-motion-coach-quiet-toggle">
        <input
          type="checkbox"
          checked={coachSettings.quietDuringSet}
          onChange={(e) => onChangeCoachSettings({ ...coachSettings, quietDuringSet: e.target.checked })}
        />
        <span>Tyst under set (räkna endast siffror)</span>
      </label>

      {/* Steg 42: Reflektion i vila (Opt-in) */}
      <label className="p100-motion-coach-quiet-toggle">
        <input
          type="checkbox"
          checked={coachSettings.enableRestReflection ?? true}
          onChange={(e) => onChangeCoachSettings({ ...coachSettings, enableRestReflection: e.target.checked })}
        />
        <span>Reflektion under vila (Opt-in coachfråga)</span>
      </label>

      {/* Steg 45: Personbästan & Minnesöversikt */}
      {coachMemory && coachMemory.personalRecords.maxSessionVolume > 0 ? (
        <div className="p100-motion-pr-summary-card">
          <div className="p100-motion-pr-header">
            <span>🏆 Personbästan & Statistik</span>
          </div>
          <div className="p100-motion-pr-grid">
            <div>
              <small>Max reps i set</small>
              <strong>{coachMemory.personalRecords.maxRepsInSet}</strong>
            </div>
            <div>
              <small>Max volym</small>
              <strong>{coachMemory.personalRecords.maxSessionVolume} reps</strong>
            </div>
            <div>
              <small>Bästa snitt-ROM</small>
              <strong>{coachMemory.personalRecords.bestAverageRomPercent}%</strong>
            </div>
            {coachMemory.personalRecords.bestSymmetryScore !== undefined ? (
              <div>
                <small>Bästa balans</small>
                <strong>{coachMemory.personalRecords.bestSymmetryScore}%</strong>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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
                  <th>RPE</th>
                  <th>Tid</th>
                </tr>
              </thead>
              <tbody>
                {workoutSession.completedSets.map((s, idx) => (
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
                    <td>
                      {s.rpe === "easy" ? (
                        <span className="p100-motion-badge badge-full">Lätt</span>
                      ) : s.rpe === "moderate" ? (
                        <span className="p100-motion-badge badge-mod">Lagom</span>
                      ) : s.rpe === "hard" ? (
                        <span className="p100-motion-badge badge-half">Tungt</span>
                      ) : onRecordRpe ? (
                        <button
                          type="button"
                          className="p100-motion-btn-rpe-mini"
                          onClick={() => onRecordRpe(idx, "moderate")}
                          title="Klicka för att sätta RPE"
                        >
                          + RPE
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{(s.durationMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {workoutSession.status === "completed" ? (
            <div className="p100-motion-workout-completed-card">
              <strong>🏆 Pass slutfört (Steg 39)</strong>
              <p>
                Total volym: <strong>{workoutSession.completedSets.reduce((acc, s) => acc + s.completedReps, 0)} reps</strong> över {workoutSession.completedSets.length} set.
                Snitt-ROM: <strong>{Math.round(workoutSession.completedSets.reduce((acc, s) => acc + s.averageRomPercent, 0) / Math.max(1, workoutSession.completedSets.length))}%</strong>.
              </p>
            </div>
          ) : null}
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
