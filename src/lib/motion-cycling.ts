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

  // Hysteresis: stay on preferredSide unless other side is clearly more visible
  let side: "left" | "right" = preferredSide;
  if (preferredSide === "left" && rightVis > leftVis + 0.6) {
    side = "right";
  } else if (preferredSide === "right" && leftVis > rightVis + 0.6) {
    side = "left";
  } else if (!landmarks[left[0]] && landmarks[right[0]]) {
    side = "right";
  } else if (leftVis >= rightVis) {
    side = "left";
  } else {
    side = "right";
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
 * Counts pedal revolutions using a hybrid approach:
 * 1. Knee angle flexion/extension (optimal in profile view).
 * 2. Vertical knee oscillation (Y-peaks and Y-valleys, optimal in front and diagonal view where handlebars may obscure feet).
 *
 * Debounced to count each revolution exactly once.
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

  // 1. Angle-based tracking
  const FLEXION_THRESHOLD = 116;
  const EXTENSION_THRESHOLD = 130;
  const MIN_AMPLITUDE_DEG = 12;
  let angleRevolutionTriggered = false;

  if (visible !== null) {
    if (phase === "seeking") {
      if (kneeAngle >= EXTENSION_THRESHOLD) {
        phase = "extended";
        strokeMaxKnee = kneeAngle;
        strokeMinKnee = kneeAngle;
      } else if (kneeAngle <= FLEXION_THRESHOLD) {
        phase = "flexed";
        strokeMinKnee = kneeAngle;
        strokeMaxKnee = kneeAngle;
      }
    } else if (phase === "extended" && kneeAngle <= FLEXION_THRESHOLD) {
      phase = "flexed";
      lastMovementAtMs = timestampMs;
    } else if (phase === "flexed" && kneeAngle >= EXTENSION_THRESHOLD) {
      if (strokeMaxKnee - strokeMinKnee >= MIN_AMPLITUDE_DEG) {
        phase = "extended";
        angleRevolutionTriggered = true;
      }
    }
  }

  // 2. Vertical knee oscillation tracking (works from Front, Diagonal, and Profile)
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftKneeVis = leftKnee?.visibility ?? 0;
  const rightKneeVis = rightKnee?.visibility ?? 0;

  const kneeLandmark =
    side === "left" && leftKneeVis >= 0.25
      ? leftKnee
      : rightKneeVis >= 0.25
      ? rightKnee
      : leftKneeVis >= 0.25
      ? leftKnee
      : null;

  let strokeMinY = state.strokeMinY;
  let strokeMaxY = state.strokeMaxY;
  let verticalDirection = state.verticalDirection;
  let verticalRevolutionTriggered = false;
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

    // Moving UP (pulling leg up, Y decreasing)
    if (dy < -0.003) {
      if (verticalDirection === "down" && verticalAmplitude >= MIN_VERTICAL_AMPLITUDE) {
        verticalDirection = "up";
        strokeMinY = currentKneeY;
      } else if (verticalDirection === "seeking") {
        verticalDirection = "up";
      }
    }
    // Moving DOWN (pushing pedal down, Y increasing)
    else if (dy > 0.003) {
      if (verticalDirection === "up" && verticalAmplitude >= MIN_VERTICAL_AMPLITUDE) {
        verticalDirection = "down";
        verticalRevolutionTriggered = true;
        strokeMaxY = currentKneeY;
      } else if (verticalDirection === "seeking") {
        verticalDirection = "down";
      }
    }
  }

  // 3. Combined trigger with 250ms debounce (max 240 RPM)
  const canCount = lastRevolutionAtMs === null || timestampMs - lastRevolutionAtMs >= 250;
  const shouldCount = (angleRevolutionTriggered || verticalRevolutionTriggered) && canCount;

  if (shouldCount) {
    revolutions += 1;
    let revRpm = cadenceRpm ?? 0;
    let interval = 0;
    if (lastRevolutionAtMs !== null) {
      const intervalMs = timestampMs - lastRevolutionAtMs;
      interval = intervalMs;
      if (intervalMs >= 250 && intervalMs <= 4_500) {
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

    // Reset stroke tracking
    strokeMinKnee = kneeAngle;
    strokeMaxKnee = kneeAngle;
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
