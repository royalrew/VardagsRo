import { computeJointAngle3D } from "./motion-camera-coach";
import type { MotionLandmark } from "./motion-engine";

export type CyclingPhase = "seeking" | "extended" | "flexed";

export interface CyclingTrackerState {
  phase: CyclingPhase;
  revolutions: number;
  cadenceRpm: number | null;
  activeSeconds: number;
  lastKneeAngle: number;
  lastRevolutionAtMs: number | null;
  lastMovementAtMs: number | null;
  lastSampleAtMs: number | null;
}

export function createCyclingTracker(): CyclingTrackerState {
  return {
    phase: "seeking",
    revolutions: 0,
    cadenceRpm: null,
    activeSeconds: 0,
    lastKneeAngle: 180,
    lastRevolutionAtMs: null,
    lastMovementAtMs: null,
    lastSampleAtMs: null,
  };
}

function legVisibility(landmarks: readonly MotionLandmark[], indexes: readonly number[]): number {
  return indexes.reduce((sum, index) => sum + (landmarks[index]?.visibility ?? 0), 0);
}

function visibleKneeAngle(landmarks: readonly MotionLandmark[], aspectRatio: number): number | null {
  const left = [23, 25, 27] as const;
  const right = [24, 26, 28] as const;
  const indexes = legVisibility(landmarks, left) >= legVisibility(landmarks, right) ? left : right;
  if (indexes.some((index) => (landmarks[index]?.visibility ?? 0) < 0.45)) return null;
  return computeJointAngle3D(
    landmarks[indexes[0]],
    landmarks[indexes[1]],
    landmarks[indexes[2]],
    aspectRatio,
  );
}

/**
 * Counts one pedal revolution from an extended -> flexed -> extended knee cycle.
 * Cadence is deliberately labelled as an estimate until real camera tests tune
 * the thresholds for the user's bike, angle and pedalling style.
 */
export function advanceCyclingTracker(
  landmarks: readonly MotionLandmark[],
  state: CyclingTrackerState,
  deltaSeconds: number,
  aspectRatio = 1,
  timestampMs = performance.now(),
): CyclingTrackerState {
  const kneeAngle = visibleKneeAngle(landmarks, aspectRatio);
  if (kneeAngle === null) return state;

  let phase = state.phase;
  let revolutions = state.revolutions;
  let cadenceRpm = state.cadenceRpm;
  let lastRevolutionAtMs = state.lastRevolutionAtMs;
  let lastMovementAtMs = state.lastMovementAtMs;
  const moved = Math.abs(kneeAngle - state.lastKneeAngle) >= 2;
  if (moved) lastMovementAtMs = timestampMs;

  if (phase === "seeking" && kneeAngle >= 135) {
    phase = "extended";
  } else if (phase === "extended" && kneeAngle <= 105) {
    phase = "flexed";
    lastMovementAtMs = timestampMs;
  } else if (phase === "flexed" && kneeAngle >= 135) {
    phase = "extended";
    revolutions += 1;
    if (lastRevolutionAtMs !== null) {
      const intervalMs = timestampMs - lastRevolutionAtMs;
      if (intervalMs >= 250 && intervalMs <= 3_000) {
        const instantRpm = 60_000 / intervalMs;
        cadenceRpm = Math.round(
          cadenceRpm === null ? instantRpm : cadenceRpm * 0.65 + instantRpm * 0.35,
        );
      }
    }
    lastRevolutionAtMs = timestampMs;
    lastMovementAtMs = timestampMs;
  }

  const movementIsCurrent = lastMovementAtMs !== null && timestampMs - lastMovementAtMs <= 2_000;
  const measuredDeltaSeconds = state.lastSampleAtMs === null
    ? Math.max(0, deltaSeconds)
    : Math.min(0.25, Math.max(0, (timestampMs - state.lastSampleAtMs) / 1_000));
  const activeSeconds = state.activeSeconds + (movementIsCurrent ? measuredDeltaSeconds : 0);
  if (!movementIsCurrent && lastRevolutionAtMs !== null && timestampMs - lastRevolutionAtMs > 3_000) {
    cadenceRpm = null;
  }

  return {
    phase,
    revolutions,
    cadenceRpm,
    activeSeconds,
    lastKneeAngle: kneeAngle,
    lastRevolutionAtMs,
    lastMovementAtMs,
    lastSampleAtMs: timestampMs,
  };
}
