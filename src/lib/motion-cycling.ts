import { computeJointAngle } from "./motion-exercises";
import type { MotionLandmark } from "./motion-engine";

export type CyclingPhase = "seeking" | "extended" | "flexed";

export interface CyclingRevolutionSample {
  revolutionNumber: number;
  intervalMs: number;
  rpm: number;
  timestampMs: number;
  minKneeAngle: number;
  maxKneeAngle: number;
}

export interface CyclingTrackerState {
  phase: CyclingPhase;
  revolutions: number;
  cadenceRpm: number | null;
  activeSeconds: number;
  lastKneeAngle: number;
  lastRevolutionAtMs: number | null;
  lastMovementAtMs: number | null;
  lastSampleAtMs: number | null;
  side: "left" | "right";
  strokeMinKneeAngle: number;
  strokeMaxKneeAngle: number;
  minKneeAngleObserved: number;
  maxKneeAngleObserved: number;
  revolutionsHistory: CyclingRevolutionSample[];
  // Vertical knee oscillation tracking (works from FRONT, DIAGONAL, and PROFILE):
  lastKneeY: number | null;
  strokeMinY: number;
  strokeMaxY: number;
  verticalDirection: "up" | "down" | "seeking";
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
    side: "left",
    strokeMinKneeAngle: 180,
    strokeMaxKneeAngle: 0,
    minKneeAngleObserved: 180,
    maxKneeAngleObserved: 0,
    revolutionsHistory: [],
    lastKneeY: null,
    strokeMinY: 1.0,
    strokeMaxY: 0.0,
    verticalDirection: "seeking",
  };
}

function legVisibility(landmarks: readonly MotionLandmark[], indexes: readonly number[]): number {
  return indexes.reduce((sum, index) => sum + (landmarks[index]?.visibility ?? 0), 0);
}

function visibleKneeAngle(
  landmarks: readonly MotionLandmark[],
  aspectRatio: number,
  preferredSide: "left" | "right" = "left",
): { angle: number; side: "left" | "right" } | null {
  const left = [23, 25, 27] as const;
  const right = [24, 26, 28] as const;
  const leftVis = legVisibility(landmarks, left);
  const rightVis = legVisibility(landmarks, right);

  // Strong hysteresis: stay on preferredSide unless current side is lost and other side is clearly superior
  let side: "left" | "right" = preferredSide;
  const preferredVis = preferredSide === "left" ? leftVis : rightVis;
  const otherVis = preferredSide === "left" ? rightVis : leftVis;

  if (otherVis > preferredVis + 0.7) {
    side = preferredSide === "left" ? "right" : "left";
  }

  const indexes = side === "left" ? left : right;
  const hipVis = landmarks[indexes[0]]?.visibility ?? 0;
  const kneeVis = landmarks[indexes[1]]?.visibility ?? 0;
  const ankleVis = landmarks[indexes[2]]?.visibility ?? 0;

  // Hip and Knee are primary landmarks; ankle can be partially blocked by pedals/handlebars
  if (hipVis < 0.35 || kneeVis < 0.35 || ankleVis < 0.20) return null;

  const angle = computeJointAngle(
    landmarks[indexes[0]],
    landmarks[indexes[1]],
    landmarks[indexes[2]],
    aspectRatio,
  );
  if (angle === null) return null;
  return { angle, side };
}

/**
 * Counts pedal revolutions using a unified cycle state machine:
 * - Phase "flexed" (knee pulled up to top of pedal stroke).
 * - Phase "extended" (knee pushed down to bottom of pedal stroke).
 * 
 * Works across all camera placements:
 * 1. Profile / Side: driven by knee flexion/extension angle.
 * 2. Diagonal / Snett: reinforced by both angle and vertical knee oscillation.
 * 3. Frontal / Rakt framifrån: driven by vertical knee oscillation when ankles are hidden.
 *
 * Exactly ONE revolution is counted per full 360° crank rotation (at bottom dead center).
 */
export function advanceCyclingTracker(
  landmarks: readonly MotionLandmark[],
  state: CyclingTrackerState,
  deltaSeconds: number,
  aspectRatio = 1,
  timestampMs = performance.now(),
): CyclingTrackerState {
  if (!landmarks || landmarks.length < 27) return state;

  const visible = visibleKneeAngle(landmarks, aspectRatio, state.side);
  const side = visible ? visible.side : state.side;
  const kneeAngle = visible ? visible.angle : state.lastKneeAngle;

  let phase = state.phase;
  let revolutions = state.revolutions;
  let cadenceRpm = state.cadenceRpm;
  let lastRevolutionAtMs = state.lastRevolutionAtMs;
  let lastMovementAtMs = state.lastMovementAtMs;

  const angleMoved = Math.abs(kneeAngle - state.lastKneeAngle) >= 2;
  if (angleMoved) lastMovementAtMs = timestampMs;

  let strokeMinKnee = Math.min(state.strokeMinKneeAngle, kneeAngle);
  let strokeMaxKnee = Math.max(state.strokeMaxKneeAngle, kneeAngle);
  const minObserved = Math.min(state.minKneeAngleObserved, kneeAngle);
  const maxObserved = Math.max(state.maxKneeAngleObserved, kneeAngle);
  let revolutionsHistory = state.revolutionsHistory;

  // 1. Angle thresholds (natural exercise bike angles)
  const FLEXION_THRESHOLD = 116;
  const EXTENSION_THRESHOLD = 130;
  const MIN_AMPLITUDE_DEG = 12;

  let legIsFlexed = false;
  let legIsExtended = false;

  if (visible !== null) {
    if (kneeAngle <= FLEXION_THRESHOLD) {
      legIsFlexed = true;
    } else if (
      kneeAngle >= EXTENSION_THRESHOLD &&
      strokeMaxKnee - strokeMinKnee >= MIN_AMPLITUDE_DEG
    ) {
      legIsExtended = true;
    }
  }

  // 2. Vertical knee oscillation tracking (locked to the tracked leg)
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftKneeVis = leftKnee?.visibility ?? 0;
  const rightKneeVis = rightKnee?.visibility ?? 0;

  const kneeLandmark =
    side === "left"
      ? (leftKneeVis >= 0.25 ? leftKnee : null)
      : (rightKneeVis >= 0.25 ? rightKnee : null);

  let strokeMinY = state.strokeMinY;
  let strokeMaxY = state.strokeMaxY;
  let verticalDirection = state.verticalDirection;
  let currentKneeY = state.lastKneeY;

  if (kneeLandmark) {
    currentKneeY = kneeLandmark.y;
    const prevY = state.lastKneeY ?? currentKneeY;
    const dy = currentKneeY - prevY;

    if (Math.abs(dy) >= 0.003) {
      lastMovementAtMs = timestampMs;
    }

    strokeMinY = Math.min(strokeMinY, currentKneeY);
    strokeMaxY = Math.max(strokeMaxY, currentKneeY);

    const verticalAmplitude = strokeMaxY - strokeMinY;
    const MIN_VERTICAL_AMPLITUDE = 0.035; // 3.5% of frame height

    if (verticalAmplitude >= MIN_VERTICAL_AMPLITUDE) {
      const zoneThreshold = verticalAmplitude * 0.25;
      // Top zone of pedal stroke (knee pulled up)
      if (currentKneeY <= strokeMinY + zoneThreshold) {
        legIsFlexed = true;
        verticalDirection = "up";
      }
      // Bottom zone of pedal stroke (knee pushed down)
      else if (currentKneeY >= strokeMaxY - zoneThreshold) {
        legIsExtended = true;
        verticalDirection = "down";
      }
    }
  }

  // 3. Unified cycle state machine: exactly 1 revolution per complete flexed -> extended cycle
  const MIN_REVOLUTION_INTERVAL_MS = 360; // Debounce prevents half-cycle double counting (max 166 RPM)
  let revolutionTriggered = false;

  if (phase === "seeking") {
    if (legIsExtended) {
      phase = "extended";
      strokeMaxKnee = kneeAngle;
      strokeMinKnee = kneeAngle;
    } else if (legIsFlexed) {
      phase = "flexed";
      strokeMinKnee = kneeAngle;
      strokeMaxKnee = kneeAngle;
    }
  } else if (phase === "extended") {
    if (legIsFlexed) {
      phase = "flexed";
      lastMovementAtMs = timestampMs;
    }
  } else if (phase === "flexed") {
    if (legIsExtended) {
      const canCount =
        lastRevolutionAtMs === null || timestampMs - lastRevolutionAtMs >= MIN_REVOLUTION_INTERVAL_MS;
      if (canCount) {
        phase = "extended";
        revolutionTriggered = true;
      }
    }
  }

  if (revolutionTriggered) {
    revolutions += 1;
    let revRpm = cadenceRpm ?? 0;
    let interval = 0;
    if (lastRevolutionAtMs !== null) {
      const intervalMs = timestampMs - lastRevolutionAtMs;
      interval = intervalMs;
      if (intervalMs >= MIN_REVOLUTION_INTERVAL_MS && intervalMs <= 4_500) {
        const instantRpm = Math.round(60_000 / intervalMs);
        revRpm = instantRpm;
        cadenceRpm = Math.round(
          cadenceRpm === null ? instantRpm : cadenceRpm * 0.65 + instantRpm * 0.35,
        );
      }
    }
    lastRevolutionAtMs = timestampMs;
    lastMovementAtMs = timestampMs;

    // Record completed revolution
    const newRevSample: CyclingRevolutionSample = {
      revolutionNumber: revolutions,
      intervalMs: Math.round(interval),
      rpm: revRpm,
      timestampMs: Math.round(timestampMs),
      minKneeAngle: Math.round(strokeMinKnee),
      maxKneeAngle: Math.round(strokeMaxKnee),
    };
    revolutionsHistory = [...revolutionsHistory.slice(-99), newRevSample];

    // Reset stroke tracking for the next revolution
    strokeMinKnee = kneeAngle;
    strokeMaxKnee = kneeAngle;
    if (currentKneeY !== null) {
      strokeMinY = currentKneeY;
      strokeMaxY = currentKneeY;
    }
  }

  const movementIsCurrent = lastMovementAtMs !== null && timestampMs - lastMovementAtMs <= 2_000;
  const measuredDeltaSeconds = state.lastSampleAtMs === null
    ? Math.max(0, deltaSeconds)
    : Math.min(0.25, Math.max(0, (timestampMs - state.lastSampleAtMs) / 1_000));
  const activeSeconds = state.activeSeconds + (movementIsCurrent ? measuredDeltaSeconds : 0);
  if (!movementIsCurrent && lastRevolutionAtMs !== null && timestampMs - lastRevolutionAtMs > 3_500) {
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
    side,
    strokeMinKneeAngle: strokeMinKnee,
    strokeMaxKneeAngle: strokeMaxKnee,
    minKneeAngleObserved: minObserved,
    maxKneeAngleObserved: maxObserved,
    revolutionsHistory,
    lastKneeY: currentKneeY,
    strokeMinY,
    strokeMaxY,
    verticalDirection,
  };
}
