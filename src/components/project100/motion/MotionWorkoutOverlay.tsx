"use client";

import { Check, Play, Save } from "lucide-react";
import Link from "next/link";
import React from "react";

import {
  SQUAT_PHASE_LABELS,
  type SquatTrackerState,
} from "@/lib/motion-squat";
import {
  getRestReflectionPrompt,
  type CoachSettings,
} from "@/lib/motion-coach";
import {
  getRestDurationForSet,
  getRestSecondsRemaining,
  type WorkoutSessionState,
} from "@/lib/motion-workout";
import { angleDegrees } from "./motion-formatting";
import type { UnifiedExerciseState } from "@/lib/motion-library";
import type { ProgramSessionState, ProgramSummary } from "@/lib/motion-programs";
import type { ExerciseFramingFeedback } from "@/lib/motion-camera-coach";

export interface MotionWorkoutOverlayProps {
  workoutSession: WorkoutSessionState;
  squatView: SquatTrackerState;
  squatProtocol: "workout-step-31" | "symmetry-step-26" | "tempo-step-25" | "rom-step-24";
  squatCoachCue: string;
  coachSettings?: CoachSettings;
  newPrNotice?: string | null;
  onSkipRest: () => void;
  onRecordRpe?: (setIndex: number, rpe: "easy" | "moderate" | "hard") => void;
  nowMs: number;
  activeExerciseTitle?: string;
  unifiedTracker?: UnifiedExerciseState | null;
  programSession?: ProgramSessionState | null;
  programSummary?: ProgramSummary | null;
  framingFeedback?: ExerciseFramingFeedback | null;
  onSaveToLog?: () => Promise<void> | void;
  isSavedToLog?: boolean;
  isSavingToLog?: boolean;
  saveLogError?: string | null;
}

/**
 * TV HUD overlay for Squat and Program workout sessions, displaying the large rest timer,
 * set technique summary, RPE rating, coach prompts, and log completion actions.
 */
export function MotionWorkoutOverlay({
  workoutSession,
  squatView,
  squatProtocol,
  squatCoachCue,
  coachSettings,
  newPrNotice,
  onSkipRest,
  onRecordRpe,
  nowMs,
  activeExerciseTitle,
  unifiedTracker,
  programSession,
  programSummary,
  framingFeedback,
  onSaveToLog,
  isSavedToLog,
  isSavingToLog,
  saveLogError,
}: MotionWorkoutOverlayProps): React.JSX.Element | null {
  const cameraCoachBadge = framingFeedback ? (
    <aside
      className={`p100-motion-camera-coach-hud ${framingFeedback.isOptimal ? "optimal" : "warning"}`}
      aria-live="polite"
      role="status"
    >
      <span className="p100-motion-coach-icon">
        {framingFeedback.isOptimal ? "📐" : "⚠️"}
      </span>
      <div className="p100-motion-coach-text">
        <strong>{framingFeedback.badgeLabel}</strong>
        <span>{framingFeedback.advice}</span>
      </div>
    </aside>
  ) : null;

  // 1a. Program Rest Countdown Overlay
  if (programSession && programSession.phase === "resting") {
    const remainingSec = Math.ceil(programSession.restSecondsRemaining);
    const targetSec = programSession.activeExercise.restSeconds;
    const progress = targetSec > 0 ? Math.min(100, Math.max(0, (remainingSec / targetSec) * 100)) : 0;
    const isWarning = remainingSec <= 5;
    const minutes = Math.floor(remainingSec / 60);
    const seconds = remainingSec % 60;
    const clockDisplay = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    return (
      <>
        {cameraCoachBadge}
        <div
          className={`p100-motion-tv-rest-overlay ${isWarning ? "warning" : ""}`}
          aria-live="polite"
        >
        <div className="p100-motion-tv-rest-header">
          <span className="p100-motion-tv-rest-pill">Styrkeprogram · Vila & Återhämtning</span>
          <strong>
            Vila inför {activeExerciseTitle ?? "nästa set"} (Set {programSession.currentSet} av {programSession.activeExercise.sets})
          </strong>
        </div>

        <div className="p100-motion-tv-rest-center">
          <div className="p100-motion-tv-rest-clock-wrap">
            <span className="p100-motion-tv-rest-clock">{clockDisplay}</span>
            <small className="p100-motion-tv-rest-clock-label">{remainingSec} sekunder kvar</small>
          </div>

          <div className="p100-motion-tv-rest-bar-track">
            <div
              className="p100-motion-tv-rest-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="p100-motion-tv-rest-guidance">
            {isWarning
              ? "⚠️ Gör dig redo vid kameran! Setet startar automatiskt strax."
              : "Pusta ut, skaka ur musklerna och förbered dig för nästa set."}
          </p>
        </div>

        <div className="p100-motion-tv-rest-actions">
          <button
            type="button"
            className="p100-motion-tv-rest-skip-btn"
            onClick={onSkipRest}
          >
            <Play /> Starta Set nu ({programSession.activeExercise.reps} {programSession.activeExercise.isHoldDuration ? "sek" : "reps"}) <kbd>[Mellanslag]</kbd>
          </button>
        </div>
      </div>
      </>
    );
  }
  // 1. Viloklocka / Rest Countdown Overlay (TV Mode)
  if (squatProtocol === "workout-step-31" && workoutSession.status === "resting") {
    const remainingSec = getRestSecondsRemaining(workoutSession, nowMs);
    const targetSec = getRestDurationForSet(workoutSession.config, workoutSession.currentSetIndex);
    const progress = targetSec > 0 ? Math.min(100, Math.max(0, (remainingSec / targetSec) * 100)) : 0;
    const isWarning = remainingSec <= 5;
    const minutes = Math.floor(remainingSec / 60);
    const seconds = remainingSec % 60;
    const clockDisplay = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    const lastSetIndex = workoutSession.completedSets.length - 1;
    const lastSet = lastSetIndex >= 0 ? workoutSession.completedSets[lastSetIndex] : null;

    return (
      <>
        {cameraCoachBadge}
        <div
          className={`p100-motion-tv-rest-overlay ${isWarning ? "warning" : ""}`}
          aria-live="polite"
        >
        <div className="p100-motion-tv-rest-header">
          <span className="p100-motion-tv-rest-pill">Steg 32 & 36 · Viloklocka & Sammanfattning</span>
          <strong>
            Set {workoutSession.currentSetIndex} klart! Vila inför Set {workoutSession.currentSetIndex + 1} av {workoutSession.config.targetSets}
          </strong>
        </div>

        {/* Steg 36: Set-sammanfattning (Reps, ROM, Tempo, Symmetri, Coach-observation) */}
        {lastSet ? (
          <div className="p100-motion-tv-set-summary-card">
            <div className="p100-motion-tv-summary-badges">
              <span className="p100-motion-tv-summary-badge">
                <strong>{lastSet.completedReps}</strong> reps ({lastSet.fullReps} fulla{lastSet.halfReps > 0 ? `, ${lastSet.halfReps} halva` : ""})
              </span>
              <span className="p100-motion-tv-summary-badge">
                ROM: <strong>{lastSet.averageRomPercent}%</strong>
              </span>
              {lastSet.averageTempoNotation ? (
                <span className="p100-motion-tv-summary-badge">
                  Tempo: <strong>{lastSet.averageTempoNotation}</strong>
                </span>
              ) : null}
              {lastSet.averageSymmetryScore !== undefined ? (
                <span className="p100-motion-tv-summary-badge">
                  Balans: <strong>{lastSet.averageSymmetryScore}%</strong>
                </span>
              ) : null}
            </div>
            <div className="p100-motion-tv-summary-obs">
              <span className="obs-label">Coach</span>
              <p>{lastSet.primaryObservation}</p>
            </div>
          </div>
        ) : null}

        <div className="p100-motion-tv-rest-center">
          <div className="p100-motion-tv-rest-clock-wrap">
            <span className="p100-motion-tv-rest-clock">{clockDisplay}</span>
            <small className="p100-motion-tv-rest-clock-label">{remainingSec} sekunder kvar</small>
          </div>

          <div className="p100-motion-tv-rest-bar-track">
            <div
              className="p100-motion-tv-rest-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="p100-motion-tv-rest-guidance">
            {isWarning
              ? "⚠️ Gör dig redo vid kameran! Setet startar automatiskt strax."
              : "Pusta ut, skaka ur benen och drick lite vatten. Nästa set startar automatiskt."}
          </p>
        </div>

        {newPrNotice ? (
          <div className="p100-motion-tv-pr-banner">
            🏆 <strong>PERSONBÄSTA!</strong> {newPrNotice}
          </div>
        ) : null}

        {/* Steg 37, 38 & 42: RPE-fråga, reflektion i vila och adaptiv nästa-set-visning */}
        {lastSet && onRecordRpe ? (
          <div className="p100-motion-tv-rpe-selector">
            <span className="p100-motion-tv-rpe-title">
              {coachSettings ? (getRestReflectionPrompt(lastSet.setNumber, remainingSec, coachSettings) ?? "Hur kändes setet?") : "Hur kändes setet?"}
            </span>
            <div className="p100-motion-tv-rpe-buttons">
              <button
                type="button"
                className={`rpe-btn rpe-easy ${lastSet.rpe === "easy" ? "active" : ""}`}
                onClick={() => onRecordRpe(lastSetIndex, "easy")}
                title="Lätt – ökar reps något i nästa set om formen var ren"
              >
                <span className="rpe-icon">🟢</span> Lätt <kbd>[1]</kbd>
              </button>
              <button
                type="button"
                className={`rpe-btn rpe-moderate ${lastSet.rpe === "moderate" ? "active" : ""}`}
                onClick={() => onRecordRpe(lastSetIndex, "moderate")}
                title="Lagom – behåller planerat mål"
              >
                <span className="rpe-icon">🟡</span> Lagom <kbd>[2]</kbd>
              </button>
              <button
                type="button"
                className={`rpe-btn rpe-hard ${lastSet.rpe === "hard" ? "active" : ""}`}
                onClick={() => onRecordRpe(lastSetIndex, "hard")}
                title="Tungt – justerar ned volymen för att bevara formen"
              >
                <span className="rpe-icon">🔴</span> Tungt <kbd>[3]</kbd>
              </button>
            </div>
          </div>
        ) : null}

        <div className="p100-motion-tv-rest-actions">
          <button
            type="button"
            className="p100-motion-tv-rest-skip-btn"
            onClick={onSkipRest}
          >
            <Play /> Starta Set {workoutSession.currentSetIndex + 1} nu ({workoutSession.config.targetRepsPerSet} reps) <kbd>[Mellanslag]</kbd>
          </button>
        </div>
      </div>
      </>
    );
  }

  // 2. Program Slutfört HUD
  if (programSession?.phase === "completed" || programSummary) {
    return (
      <div className="p100-motion-squat-hud tracking" aria-live="polite">
        <div>
          <small>Styrkepass slutfört!</small>
          <strong>{programSummary?.totalSets ?? programSession?.completedSets.length ?? 0} set</strong>
          <span>genomförda</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <strong>Grymt jobbat! 🎉 Hela träningsprogrammet är avklarat</strong>
          <span>
            {programSummary
              ? `${programSummary.totalReps} repetitioner totalt · +${programSummary.xpEarned} XP intjänat!`
              : "Alla planerade set och repetitioner genomförda."}
          </span>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            {onSaveToLog ? (
              <button
                type="button"
                className="p100-button"
                onClick={() => void onSaveToLog()}
                disabled={isSavingToLog || isSavedToLog}
                style={{
                  background: isSavedToLog ? "#166534" : "#245746",
                  color: "#ffffff",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: isSavedToLog ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                {isSavedToLog ? (
                  <>
                    <Check size={16} /> Sparat i träningsloggen!
                  </>
                ) : isSavingToLog ? (
                  "Sparar..."
                ) : (
                  <>
                    <Save size={16} /> Spara till träningsloggen
                  </>
                )}
              </button>
            ) : null}
            <Link
              href="/projekt-100/traning"
              className="p100-button"
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                color: "#F2F5F0",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "0.95rem",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Tillbaka till Träning
            </Link>
          </div>
          {saveLogError ? (
            <small style={{ color: "#f87171" }}>⚠️ {saveLogError}</small>
          ) : null}
        </div>
      </div>
    );
  }

  // 3. Aktiv Library Exercise HUD (Hantlar, Kettlebells, Gymnastik/Handstående, Kroppsvikt)
  if (unifiedTracker) {
    const isCycling = unifiedTracker.exerciseId === "cycling";
    const isHold = unifiedTracker.exerciseId === "handstand-hold" || unifiedTracker.exerciseId === "plank" || isCycling;
    const currentVal = isHold ? unifiedTracker.holdSeconds : unifiedTracker.reps;
    const targetVal = programSession ? programSession.activeExercise.reps : undefined;
    const setInfo = programSession
      ? `Set ${programSession.currentSet}/${programSession.activeExercise.sets}`
      : "Rörelsespårning";

    return (
      <>
        {cameraCoachBadge}
        <div className="p100-motion-squat-hud tracking" aria-live="polite">
        <div>
          <small>{activeExerciseTitle ? `${activeExerciseTitle} · ${setInfo}` : setInfo}</small>
          <strong>
            {currentVal}
            {targetVal !== undefined ? <span>/{targetVal}</span> : null}
          </strong>
          <span>{isCycling ? "sek cykling" : isHold ? "sek" : "reps"}</span>
        </div>
        <div>
          <strong>{unifiedTracker.metricLabel}</strong>
          <span>
            {isCycling
              ? `Mätläge: ${unifiedTracker.phase === "seeking" ? "söker pedalrörelse" : "pedalrörelse hittad"}`
              : `Fas: ${unifiedTracker.phase} · Teknik: ${unifiedTracker.formScore}%`}
          </span>
          {unifiedTracker.formWarning ? (
            <p className="p100-motion-squat-hud-coach" style={{ color: "#f87171" }}>
              ⚠️ {unifiedTracker.formWarning}
            </p>
          ) : (
            <p className="p100-motion-squat-hud-coach">{squatCoachCue}</p>
          )}
        </div>
      </div>
      </>
    );
  }

  // 4. Aktiv Set/Rep HUD i bildskärmen (Knäböj standard)
  return (
    <>
      {workoutSession.status !== "completed" ? cameraCoachBadge : null}
      <div
        className={`p100-motion-squat-hud ${squatView.tracking ? "tracking" : "waiting"}`}
        aria-live="polite"
      >
      {squatProtocol === "workout-step-31" && workoutSession.status === "completed" ? (
        <>
          <div>
            <small>Pass slutfört!</small>
            <strong>{workoutSession.completedSets.length}/{workoutSession.config.targetSets}</strong>
            <span>set klara</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <strong>Grymt jobbat! 🎉 Hela passet är avklarat</strong>
            <span>
              {workoutSession.completedSets.reduce((acc, s) => acc + s.completedReps, 0)} repetitioner genomförda hands-free. Se fullständig sammanfattning och tekniktrend i sidopanelen.
            </span>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              {onSaveToLog ? (
                <button
                  type="button"
                  className="p100-button"
                  onClick={() => void onSaveToLog()}
                  disabled={isSavingToLog || isSavedToLog}
                  style={{
                    background: isSavedToLog ? "#166534" : "#245746",
                    color: "#ffffff",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    cursor: isSavedToLog ? "default" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  {isSavedToLog ? (
                    <>
                      <Check size={16} /> Sparat i träningsloggen!
                    </>
                  ) : isSavingToLog ? (
                    "Sparar..."
                  ) : (
                    <>
                      <Save size={16} /> Spara till träningsloggen
                    </>
                  )}
                </button>
              ) : null}
              <Link
                href="/projekt-100/traning"
                className="p100-button"
                style={{
                  background: "rgba(255, 255, 255, 0.12)",
                  color: "#F2F5F0",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "0.95rem",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Tillbaka till Träning
              </Link>
            </div>
            {saveLogError ? (
              <small style={{ color: "#f87171" }}>⚠️ {saveLogError}</small>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div>
            <small>
              {`Set ${workoutSession.currentSetIndex + 1}/${workoutSession.config.targetSets} · Pass 3×10`}
            </small>
            <strong>
              {squatView.reps}
              <span>
                {`/${workoutSession.config.targetRepsPerSet}`}
              </span>
            </strong>
            <span>reps</span>
          </div>
          <div>
            <strong>{squatView.tracking ? SQUAT_PHASE_LABELS[squatView.phase] : "Pose pausad"} · ROM {squatView.currentRomPercent}%</strong>
            <span>
              {`Set ${workoutSession.currentSetIndex + 1}/${workoutSession.config.targetSets} · Fulla: ${squatView.fullReps} · Halva: ${squatView.halfReps} · Knä ${angleDegrees(squatView.measurement.knee)}`}
            </span>
            <p className="p100-motion-squat-hud-coach">{squatCoachCue}</p>
          </div>
        </>
      )}
    </div>
    </>
  );
}
