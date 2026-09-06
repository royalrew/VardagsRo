"use client";

import { Play } from "lucide-react";
import React from "react";

import {
  SQUAT_PHASE_LABELS,
  type SquatTrackerState,
} from "@/lib/motion-squat";
import {
  getRestDurationForSet,
  getRestSecondsRemaining,
  type WorkoutSessionState,
} from "@/lib/motion-workout";
import { angleDegrees } from "./motion-formatting";

export interface MotionWorkoutOverlayProps {
  workoutSession: WorkoutSessionState;
  squatView: SquatTrackerState;
  squatProtocol: "workout-step-31" | "symmetry-step-26" | "tempo-step-25" | "rom-step-24";
  squatCoachCue: string;
  onSkipRest: () => void;
  nowMs: number;
}

/**
 * TV HUD overlay for Squat workout sessions, displaying the large rest timer
 * and in-stage rep count, ROM progress, and coach prompts.
 */
export function MotionWorkoutOverlay({
  workoutSession,
  squatView,
  squatProtocol,
  squatCoachCue,
  onSkipRest,
  nowMs,
}: MotionWorkoutOverlayProps): React.JSX.Element | null {
  // 1. Viloklocka / Rest Countdown Overlay (TV Mode)
  if (squatProtocol === "workout-step-31" && workoutSession.status === "resting") {
    const remainingSec = getRestSecondsRemaining(workoutSession, nowMs);
    const targetSec = getRestDurationForSet(workoutSession.config, workoutSession.currentSetIndex);
    const progress = targetSec > 0 ? Math.min(100, Math.max(0, (remainingSec / targetSec) * 100)) : 0;
    const isWarning = remainingSec <= 5;
    const minutes = Math.floor(remainingSec / 60);
    const seconds = remainingSec % 60;
    const clockDisplay = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    return (
      <div
        className={`p100-motion-tv-rest-overlay ${isWarning ? "warning" : ""}`}
        aria-live="polite"
      >
        <div className="p100-motion-tv-rest-header">
          <span className="p100-motion-tv-rest-pill">Steg 32 · Viloklocka</span>
          <strong>
            Set {workoutSession.currentSetIndex} klart! Vila inför Set {workoutSession.currentSetIndex + 1} av {workoutSession.config.targetSets}
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
              : "Pusta ut, skaka ur benen och drick lite vatten. Nästa set startar automatiskt."}
          </p>
        </div>

        <div className="p100-motion-tv-rest-actions">
          <button
            type="button"
            className="p100-motion-tv-rest-skip-btn"
            onClick={onSkipRest}
          >
            <Play /> Starta Set {workoutSession.currentSetIndex + 1} nu <kbd>[Mellanslag]</kbd>
          </button>
        </div>
      </div>
    );
  }

  // 2. Aktiv Set/Rep HUD i bildskärmen
  return (
    <div
      className={`p100-motion-squat-hud ${squatView.tracking ? "tracking" : "waiting"}`}
      aria-live="polite"
    >
      {squatProtocol === "workout-step-31" && workoutSession.status === "completed" ? (
        <>
          <div>
            <small>Pass slutfört!</small>
            <strong>3/3</strong>
            <span>set klara</span>
          </div>
          <div>
            <strong>Grymt jobbat! 🎉 Hela passet är avklarat</strong>
            <span>30 repetitioner registrerade hands-free. Se rapport och statistik i panelen.</span>
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
  );
}
