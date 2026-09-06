import type { MotionLandmark } from "./motion-engine";

export type SquatPhase = "waiting" | "standing" | "descending" | "bottom" | "ascending";

export type SquatClassification = "full" | "half";

export interface SquatSideAngles {
  hip: number | null;
  knee: number;
  ankle: number | null;
  confidence: number;
  thighLength?: number | null;
  shinLength?: number | null;
  hipY?: number | null;
  kneeY?: number | null;
}

export interface SquatAngleMeasurement {
  left: SquatSideAngles | null;
  right: SquatSideAngles | null;
  hip: number | null;
  knee: number | null;
  ankle: number | null;
  trackedSides: 0 | 1 | 2;
  thighLength?: number | null;
  shinLength?: number | null;
  hipY?: number | null;
  kneeY?: number | null;
}

export interface SquatTempoBreakdown {
  eccentricMs: number;
  bottomMs: number;
  concentricMs: number;
  notation: string;
}

export interface SquatSymmetryBreakdown {
  kneeAngleDiff: number;
  hipHeightDiff: number;
  lateralShift: number;
  symmetryScore: number;
  dominantSide: "balanced" | "left" | "right";
  observation: string;
}

export interface SquatRepSummary {
  durationMs: number;
  minimumKneeAngle: number;
  classification: SquatClassification;
  romPercent: number;
  relativeDepth: number;
  tempo?: SquatTempoBreakdown;
  symmetry?: SquatSymmetryBreakdown;
}

export interface SquatTrackerState {
  phase: SquatPhase;
  reps: number;
  halfReps: number;
  fullReps: number;
  measurement: SquatAngleMeasurement;
  tracking: boolean;
  lastTimestampMs: number;
  lastReliableAtMs: number | null;
  currentRepStartedAtMs: number | null;
  currentRepBottomEnteredAtMs: number | null;
  currentRepAscentStartedAtMs: number | null;
  currentRepMinimumKneeAngle: number | null;
  currentRepMaximumRelativeDepth: number | null;
  currentRepMinLeftKnee: number | null;
  currentRepMinRightKnee: number | null;
  currentRepMaxHipHeightDiff: number | null;
  lastRep: SquatRepSummary | null;
  repsHistory: readonly SquatRepSummary[];
  samples: number;
  trackedSamples: number;
  bothSidesSamples: number;
  minimumKneeAngle: number | null;
  maximumKneeAngle: number | null;
  standingHipY: number | null;
  standingThighLength: number | null;
  currentRomPercent: number;
}

export type SquatCueSound = "half-depth" | "full-depth" | "milestone" | "rep" | "warning";

export interface SquatVoiceCue {
  text: string;
  priority: boolean;
  sound?: SquatCueSound;
}

export const SQUAT_THRESHOLDS = {
  descentStartsBelowDegrees: 156,
  halfSquatEntersBelowDegrees: 148,
  halfTurnaroundAscentDegrees: 5,
  bottomEntersAtDegrees: 115,
  bottomExitsAboveDegrees: 122,
  standingEntersAtDegrees: 153,
  minimumRepDurationMs: 300,
  maximumRepDurationMs: 10_000,
  lostTrackingResetMs: 2_500,
  minimumVisibility: 0.38,
} as const;

const EMPTY_MEASUREMENT: SquatAngleMeasurement = {
  left: null,
  right: null,
  hip: null,
  knee: null,
  ankle: null,
  trackedSides: 0,
  thighLength: null,
  shinLength: null,
  hipY: null,
  kneeY: null,
};

export interface SquatTempoAnalysis {
  averageEccentricMs: number;
  averageBottomMs: number;
  averageConcentricMs: number;
  variationsDetected: number;
  tempoPassed: boolean;
}

export interface SquatSymmetryAnalysis {
  averageSymmetryScore: number;
  asymmetricRepsCount: number;
  symmetricRepsCount: number;
  symmetryPassed: boolean;
}

export interface SquatTestReport {
  version: 2;
  kind: "motion-squat-test";
  createdAt: string;
  protocol: "rom-step-24" | "tempo-step-25" | "symmetry-step-26";
  containsRawVideo: false;
  reps: number;
  halfReps: number;
  fullReps: number;
  phase: SquatPhase;
  trackingQualityPercent: number;
  bothSidesPercent: number;
  kneeAngleRange: { minimum: number | null; maximum: number | null };
  userGeometry: {
    standingKneeAngle: number | null;
    thighLength: number | null;
    shinLength: number | null;
  };
  lastRep: SquatRepSummary | null;
  repsHistory: readonly SquatRepSummary[];
  romClassificationPassed: boolean;
  expectedProtocolResult: string;
  tempoAnalysis?: SquatTempoAnalysis;
  symmetryAnalysis?: SquatSymmetryAnalysis;
}

interface Point2 {
  x: number;
  y: number;
}

function usableLandmark(landmark: MotionLandmark | undefined): landmark is MotionLandmark {
  return Boolean(
    landmark
      && Number.isFinite(landmark.x)
      && Number.isFinite(landmark.y)
      && Number.isFinite(landmark.z)
      && (landmark.visibility ?? 1) >= SQUAT_THRESHOLDS.minimumVisibility,
  );
}

function toAspectCorrectedPoint(landmark: MotionLandmark, aspectRatio: number): Point2 {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  return {
    x: landmark.x * safeAspectRatio,
    y: landmark.y,
  };
}

export function motionJointAngle(
  first: MotionLandmark,
  joint: MotionLandmark,
  third: MotionLandmark,
  aspectRatio = 1,
): number | null {
  if (!usableLandmark(first) || !usableLandmark(joint) || !usableLandmark(third)) return null;
  const a = toAspectCorrectedPoint(first, aspectRatio);
  const b = toAspectCorrectedPoint(joint, aspectRatio);
  const c = toAspectCorrectedPoint(third, aspectRatio);
  // Image-plane angles remain reproducible from front and 45° views. MediaPipe's
  // inferred z can swing heavily when legs overlap and must not drive rep state.
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const abLength = Math.hypot(ab.x, ab.y);
  const cbLength = Math.hypot(cb.x, cb.y);
  if (abLength < 1e-6 || cbLength < 1e-6) return null;
  const cosine = Math.min(
    1,
    Math.max(-1, (ab.x * cb.x + ab.y * cb.y) / (abLength * cbLength)),
  );
  return Math.acos(cosine) * (180 / Math.PI);
}

function sideAngles(
  landmarks: readonly MotionLandmark[],
  indices: { shoulder: number; hip: number; knee: number; ankle: number; foot: number },
  aspectRatio: number,
): SquatSideAngles | null {
  const shoulder = landmarks[indices.shoulder];
  const hip = landmarks[indices.hip];
  const knee = landmarks[indices.knee];
  const ankle = landmarks[indices.ankle];
  const foot = landmarks[indices.foot];
  if (!usableLandmark(hip) || !usableLandmark(knee)) return null;

  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const hipPoint = { x: hip.x * safeAspect, y: hip.y };
  const kneePoint = { x: knee.x * safeAspect, y: knee.y };
  const thighLength = Math.hypot(hipPoint.x - kneePoint.x, hipPoint.y - kneePoint.y);

  const hipAngle = usableLandmark(shoulder)
    ? motionJointAngle(shoulder, hip, knee, aspectRatio)
    : null;

  let kneeAngle: number | null = null;
  let shinLength: number | null = null;
  let ankleConfidence = 0.85;

  if (usableLandmark(ankle)) {
    const rawKnee = motionJointAngle(hip, knee, ankle, aspectRatio);
    // Reject edge-of-frame noise glitches (e.g. angle < 50°) when feet touch bottom of screen
    if (rawKnee !== null && rawKnee >= 50 && rawKnee <= 185) {
      kneeAngle = rawKnee;
      const anklePoint = { x: ankle.x * safeAspect, y: ankle.y };
      shinLength = Math.hypot(kneePoint.x - anklePoint.x, kneePoint.y - anklePoint.y);
      ankleConfidence = ankle.visibility ?? 1;
    }
  }

  // Living-room distance fallback:
  // If feet/ankles are cut off by the bottom edge of the webcam frame (e.g. 1.8-2.5m distance),
  // project the shin vertically down or use torso-thigh flexion.
  if (kneeAngle === null) {
    const virtualAnkle: MotionLandmark = {
      x: knee.x,
      y: knee.y + (thighLength > 0 ? thighLength : 0.3),
      z: knee.z,
      visibility: 0.9,
    };
    const projectedAngle = motionJointAngle(hip, knee, virtualAnkle, aspectRatio);
    if (projectedAngle !== null && projectedAngle >= 50) {
      kneeAngle = hipAngle !== null ? Math.min(projectedAngle, hipAngle) : projectedAngle;
    } else if (hipAngle !== null) {
      kneeAngle = hipAngle;
    }
  }

  if (kneeAngle === null) return null;

  const ankleAngle = usableLandmark(foot) && usableLandmark(ankle)
    ? motionJointAngle(knee, ankle, foot, aspectRatio)
    : null;

  return {
    hip: hipAngle,
    knee: kneeAngle,
    ankle: ankleAngle,
    confidence: Math.min(
      hip.visibility ?? 1,
      knee.visibility ?? 1,
      ankleConfidence,
    ),
    thighLength,
    shinLength,
    hipY: hip.y,
    kneeY: knee.y,
  };
}

function weightedAngle(
  sides: readonly SquatSideAngles[],
  key: "hip" | "knee" | "ankle",
): number | null {
  const usableSides = sides.filter((side) => side[key] !== null);
  const confidenceTotal = usableSides.reduce((total, side) => total + side.confidence, 0);
  if (confidenceTotal <= 0) return null;
  return usableSides.reduce((total, side) => total + (side[key] ?? 0) * side.confidence, 0) / confidenceTotal;
}

export function measureSquatAngles(
  landmarks: readonly MotionLandmark[],
  aspectRatio = 1,
): SquatAngleMeasurement {
  const left = sideAngles(
    landmarks,
    { shoulder: 11, hip: 23, knee: 25, ankle: 27, foot: 31 },
    aspectRatio,
  );
  const right = sideAngles(
    landmarks,
    { shoulder: 12, hip: 24, knee: 26, ankle: 28, foot: 32 },
    aspectRatio,
  );
  const sides = [left, right].filter((side): side is SquatSideAngles => side !== null);

  const avgThighLength = sides.length > 0
    ? sides.reduce((acc, s) => acc + (s.thighLength ?? 0), 0) / sides.length
    : null;
  const avgShinLength = sides.length > 0
    ? sides.reduce((acc, s) => acc + (s.shinLength ?? 0), 0) / sides.length
    : null;
  const avgHipY = sides.length > 0
    ? sides.reduce((acc, s) => acc + (s.hipY ?? 0), 0) / sides.length
    : null;
  const avgKneeY = sides.length > 0
    ? sides.reduce((acc, s) => acc + (s.kneeY ?? 0), 0) / sides.length
    : null;

  return {
    left,
    right,
    hip: weightedAngle(sides, "hip"),
    knee: weightedAngle(sides, "knee"),
    ankle: weightedAngle(sides, "ankle"),
    trackedSides: sides.length as 0 | 1 | 2,
    thighLength: avgThighLength,
    shinLength: avgShinLength,
    hipY: avgHipY,
    kneeY: avgKneeY,
  };
}

/** Calculate percentage ROM from knee angle and optional body-relative hip drop ratio. */
export function calculateSquatRom(kneeAngle: number | null, relativeDepth = 0): number {
  if (kneeAngle === null) return 0;
  // Knee angle ROM: 170° = 0%, 135° = 50%, 105° = 93%, 100° = 100%
  const angleRom = Math.max(0, Math.min(150, ((170 - kneeAngle) / 70) * 100));
  if (relativeDepth > 0) {
    // Relative depth ROM: 0.80 thigh drop = 100%
    const depthRom = Math.max(0, Math.min(150, (relativeDepth / 0.8) * 100));
    return Math.round(0.6 * angleRom + 0.4 * depthRom);
  }
  return Math.round(angleRom);
}

export function calculateSquatTempo(
  startedAtMs: number,
  bottomEnteredAtMs: number | null,
  ascentStartedAtMs: number | null,
  completedAtMs: number,
): SquatTempoBreakdown {
  const totalDurationMs = Math.max(0, completedAtMs - startedAtMs);
  const bottomEntered = bottomEnteredAtMs !== null
    ? Math.min(completedAtMs, Math.max(startedAtMs, bottomEnteredAtMs))
    : startedAtMs + Math.round(totalDurationMs * 0.4);

  const ascentStarted = ascentStartedAtMs !== null
    ? Math.min(completedAtMs, Math.max(bottomEntered, ascentStartedAtMs))
    : Math.max(bottomEntered, completedAtMs - Math.round(totalDurationMs * 0.4));

  const eccentricMs = Math.max(0, bottomEntered - startedAtMs);
  const bottomMs = Math.max(0, ascentStarted - bottomEntered);
  const concentricMs = Math.max(0, completedAtMs - ascentStarted);

  const eccSec = Math.round(eccentricMs / 1000);
  const botSec = Math.round(bottomMs / 1000);
  const conSec = Math.round(concentricMs / 1000);

  return {
    eccentricMs,
    bottomMs,
    concentricMs,
    notation: `${eccSec}-${botSec}-${conSec}`,
  };
}

/** Calculate bilateral knee and hip symmetry with safe non-diagnostic observations. */
export function calculateSquatSymmetry(
  minLeftKnee: number | null,
  minRightKnee: number | null,
  maxHipHeightDiff: number | null,
  standingThighLength: number | null,
  lateralShift = 0,
): SquatSymmetryBreakdown | undefined {
  if (minLeftKnee === null || minRightKnee === null) {
    return undefined;
  }

  const kneeAngleDiff = Math.round(Math.abs(minLeftKnee - minRightKnee) * 10) / 10;
  const safeThigh = standingThighLength !== null && standingThighLength > 0.05 ? standingThighLength : 0.3;
  const hipHeightDiff = maxHipHeightDiff !== null
    ? Math.round((maxHipHeightDiff / safeThigh) * 100) / 100
    : 0;

  // Bilateral symmetry score with deadzone for natural minor variance:
  // Knee angle difference <= 3° has no penalty. Beyond 3°, penalty scales up smoothly.
  const effectiveKneeDiff = Math.max(0, kneeAngleDiff - 3);
  const kneePenalty = Math.min(55, (effectiveKneeDiff / 22) * 45);
  // Hip height tilt <= 0.03 (under ~1 cm) has no penalty.
  const effectiveHipDiff = Math.max(0, hipHeightDiff - 0.03);
  const hipPenalty = Math.min(45, (effectiveHipDiff / 0.12) * 35);
  const symmetryScore = Math.max(0, Math.min(100, Math.round(100 - (kneePenalty + hipPenalty))));

  let dominantSide: "balanced" | "left" | "right" = "balanced";
  let observation = "Jämn och balanserad rörelse mellan sidorna.";

  // Strictly safe, non-diagnostic observation phrasing
  if (kneeAngleDiff >= 7) {
    // In squats, lower angle = deeper flexion
    if (minLeftKnee < minRightKnee) {
      dominantSide = "left";
      observation = "Vänster knä böjs något djupare än höger i vändningen.";
    } else {
      dominantSide = "right";
      observation = "Höger knä böjs något djupare än vänster i vändningen.";
    }
  } else if (hipHeightDiff >= 0.08) {
    observation = "Lätt sidledsförskjutning av höften under rörelsen.";
  }

  return {
    kneeAngleDiff,
    hipHeightDiff,
    lateralShift: Math.round(lateralShift * 100) / 100,
    symmetryScore,
    dominantSide,
    observation,
  };
}

export function createSquatTrackerState(reps = 0): SquatTrackerState {
  return {
    phase: "waiting",
    reps,
    halfReps: 0,
    fullReps: reps,
    measurement: { ...EMPTY_MEASUREMENT },
    tracking: false,
    lastTimestampMs: -1,
    lastReliableAtMs: null,
    currentRepStartedAtMs: null,
    currentRepBottomEnteredAtMs: null,
    currentRepAscentStartedAtMs: null,
    currentRepMinimumKneeAngle: null,
    currentRepMaximumRelativeDepth: null,
    currentRepMinLeftKnee: null,
    currentRepMinRightKnee: null,
    currentRepMaxHipHeightDiff: null,
    lastRep: null,
    repsHistory: [],
    samples: 0,
    trackedSamples: 0,
    bothSidesSamples: 0,
    minimumKneeAngle: null,
    maximumKneeAngle: null,
    standingHipY: null,
    standingThighLength: null,
    currentRomPercent: 0,
  };
}

function abandonCurrentRep(state: SquatTrackerState, measurement: SquatAngleMeasurement, timestampMs: number): SquatTrackerState {
  return {
    ...state,
    phase: "waiting" as const,
    measurement,
    tracking: false,
    lastTimestampMs: timestampMs,
    currentRepStartedAtMs: null,
    currentRepBottomEnteredAtMs: null,
    currentRepAscentStartedAtMs: null,
    currentRepMinimumKneeAngle: null,
    currentRepMaximumRelativeDepth: null,
    currentRepMinLeftKnee: null,
    currentRepMinRightKnee: null,
    currentRepMaxHipHeightDiff: null,
    samples: state.samples + 1,
    currentRomPercent: 0,
  };
}

/** Deterministic squat state machine with personal ROM and half/full classification. */
export function advanceSquatTracker(
  state: SquatTrackerState,
  measurement: SquatAngleMeasurement,
  timestampMs: number,
): SquatTrackerState {
  if (!Number.isFinite(timestampMs) || timestampMs <= state.lastTimestampMs) return state;
  const knee = measurement.knee;
  if (knee === null || measurement.trackedSides === 0) {
    const lostForMs = state.lastReliableAtMs === null ? Infinity : timestampMs - state.lastReliableAtMs;
    if (lostForMs > SQUAT_THRESHOLDS.lostTrackingResetMs) {
      return abandonCurrentRep(state, measurement, timestampMs);
    }
    return {
      ...state,
      measurement,
      tracking: false,
      lastTimestampMs: timestampMs,
      samples: state.samples + 1,
    };
  }

  let phase = state.phase;
  let reps = state.reps;
  let halfReps = state.halfReps;
  let fullReps = state.fullReps;
  let currentRepStartedAtMs = state.currentRepStartedAtMs;
  let currentRepBottomEnteredAtMs = state.currentRepBottomEnteredAtMs;
  let currentRepAscentStartedAtMs = state.currentRepAscentStartedAtMs;
  let currentRepMinimumKneeAngle = state.currentRepMinimumKneeAngle;
  let currentRepMaximumRelativeDepth = state.currentRepMaximumRelativeDepth;
  let currentRepMinLeftKnee = state.currentRepMinLeftKnee;
  let currentRepMinRightKnee = state.currentRepMinRightKnee;
  let currentRepMaxHipHeightDiff = state.currentRepMaxHipHeightDiff;
  let lastRep = state.lastRep;
  let repsHistory = state.repsHistory;
  let standingHipY = state.standingHipY;
  let standingThighLength = state.standingThighLength;

  const hipY = measurement.hipY ?? null;
  const thighLength = measurement.thighLength ?? null;

  const hip = measurement.hip;
  const isUprightHip = hip === null || hip >= 140;

  // Calibrate standing geometry in standing phase only when genuinely standing upright
  if (phase === "standing" && hipY !== null && thighLength !== null && isUprightHip && knee >= SQUAT_THRESHOLDS.standingEntersAtDegrees) {
    if (standingHipY === null) {
      standingHipY = hipY;
    } else {
      standingHipY = standingHipY * 0.95 + hipY * 0.05;
    }
    if (standingThighLength === null) {
      standingThighLength = thighLength;
    } else {
      standingThighLength = standingThighLength * 0.95 + thighLength * 0.05;
    }
  }

  const relativeDepth = (
    hipY !== null
    && standingHipY !== null
    && standingThighLength !== null
    && standingThighLength > 0.01
  )
    ? Math.max(0, (hipY - standingHipY) / standingThighLength)
    : 0;

  const currentRom = calculateSquatRom(knee, relativeDepth);
  const isStandingHeight = standingHipY === null || relativeDepth <= 0.22;

  if (phase === "waiting") {
    if (knee >= SQUAT_THRESHOLDS.standingEntersAtDegrees && isUprightHip) phase = "standing";
  } else if (phase === "standing") {
    if (knee < SQUAT_THRESHOLDS.descentStartsBelowDegrees || (!isUprightHip && relativeDepth >= 0.25)) {
      phase = "descending";
      currentRepStartedAtMs = timestampMs;
      currentRepBottomEnteredAtMs = null;
      currentRepAscentStartedAtMs = null;
      currentRepMinimumKneeAngle = knee;
      currentRepMaximumRelativeDepth = relativeDepth;
      currentRepMinLeftKnee = measurement.left?.knee ?? null;
      currentRepMinRightKnee = measurement.right?.knee ?? null;
      currentRepMaxHipHeightDiff = (measurement.left?.hipY !== null && measurement.right?.hipY !== null && measurement.left?.hipY !== undefined && measurement.right?.hipY !== undefined)
        ? Math.abs(measurement.left.hipY - measurement.right.hipY)
        : null;
    }
  } else if (phase === "descending") {
    currentRepMinimumKneeAngle = Math.min(currentRepMinimumKneeAngle ?? knee, knee);
    currentRepMaximumRelativeDepth = Math.max(currentRepMaximumRelativeDepth ?? relativeDepth, relativeDepth);
    if (measurement.left?.knee !== null && measurement.left?.knee !== undefined) {
      currentRepMinLeftKnee = Math.min(currentRepMinLeftKnee ?? measurement.left.knee, measurement.left.knee);
    }
    if (measurement.right?.knee !== null && measurement.right?.knee !== undefined) {
      currentRepMinRightKnee = Math.min(currentRepMinRightKnee ?? measurement.right.knee, measurement.right.knee);
    }
    if (measurement.left?.hipY !== null && measurement.right?.hipY !== null && measurement.left?.hipY !== undefined && measurement.right?.hipY !== undefined) {
      const hipDiff = Math.abs(measurement.left.hipY - measurement.right.hipY);
      currentRepMaxHipHeightDiff = Math.max(currentRepMaxHipHeightDiff ?? hipDiff, hipDiff);
    }

    const reachedHalfDepth = (currentRepMinimumKneeAngle !== null && currentRepMinimumKneeAngle <= SQUAT_THRESHOLDS.halfSquatEntersBelowDegrees)
      || (currentRepMaximumRelativeDepth !== null && currentRepMaximumRelativeDepth >= 0.35);

    if (knee <= SQUAT_THRESHOLDS.bottomEntersAtDegrees) {
      phase = "bottom";
      if (currentRepBottomEnteredAtMs === null) {
        currentRepBottomEnteredAtMs = timestampMs;
      }
    } else if (
      reachedHalfDepth
      && knee >= (currentRepMinimumKneeAngle + SQUAT_THRESHOLDS.halfTurnaroundAscentDegrees)
    ) {
      // Reached at least half squat and turned around upward
      phase = "ascending";
      if (currentRepBottomEnteredAtMs === null) {
        currentRepBottomEnteredAtMs = timestampMs;
      }
      if (currentRepAscentStartedAtMs === null) {
        currentRepAscentStartedAtMs = timestampMs;
      }
    } else if (knee >= SQUAT_THRESHOLDS.standingEntersAtDegrees && isStandingHeight && isUprightHip) {
      // Shallow dip (< half squat), aborted
      phase = "standing";
      currentRepStartedAtMs = null;
      currentRepBottomEnteredAtMs = null;
      currentRepAscentStartedAtMs = null;
      currentRepMinimumKneeAngle = null;
      currentRepMaximumRelativeDepth = null;
      currentRepMinLeftKnee = null;
      currentRepMinRightKnee = null;
      currentRepMaxHipHeightDiff = null;
    }
  } else if (phase === "bottom") {
    currentRepMinimumKneeAngle = Math.min(currentRepMinimumKneeAngle ?? knee, knee);
    currentRepMaximumRelativeDepth = Math.max(currentRepMaximumRelativeDepth ?? relativeDepth, relativeDepth);
    if (measurement.left?.knee !== null && measurement.left?.knee !== undefined) {
      currentRepMinLeftKnee = Math.min(currentRepMinLeftKnee ?? measurement.left.knee, measurement.left.knee);
    }
    if (measurement.right?.knee !== null && measurement.right?.knee !== undefined) {
      currentRepMinRightKnee = Math.min(currentRepMinRightKnee ?? measurement.right.knee, measurement.right.knee);
    }
    if (measurement.left?.hipY !== null && measurement.right?.hipY !== null && measurement.left?.hipY !== undefined && measurement.right?.hipY !== undefined) {
      const hipDiff = Math.abs(measurement.left.hipY - measurement.right.hipY);
      currentRepMaxHipHeightDiff = Math.max(currentRepMaxHipHeightDiff ?? hipDiff, hipDiff);
    }

    if (knee >= SQUAT_THRESHOLDS.bottomExitsAboveDegrees) {
      phase = "ascending";
      if (currentRepAscentStartedAtMs === null) {
        currentRepAscentStartedAtMs = timestampMs;
      }
    }
  }
  if (phase === "ascending") {
    currentRepMinimumKneeAngle = Math.min(currentRepMinimumKneeAngle ?? knee, knee);
    currentRepMaximumRelativeDepth = Math.max(currentRepMaximumRelativeDepth ?? relativeDepth, relativeDepth);
    if (measurement.left?.knee !== null && measurement.left?.knee !== undefined) {
      currentRepMinLeftKnee = Math.min(currentRepMinLeftKnee ?? measurement.left.knee, measurement.left.knee);
    }
    if (measurement.right?.knee !== null && measurement.right?.knee !== undefined) {
      currentRepMinRightKnee = Math.min(currentRepMinRightKnee ?? measurement.right.knee, measurement.right.knee);
    }
    if (measurement.left?.hipY !== null && measurement.right?.hipY !== null && measurement.left?.hipY !== undefined && measurement.right?.hipY !== undefined) {
      const hipDiff = Math.abs(measurement.left.hipY - measurement.right.hipY);
      currentRepMaxHipHeightDiff = Math.max(currentRepMaxHipHeightDiff ?? hipDiff, hipDiff);
    }

    if (knee <= SQUAT_THRESHOLDS.bottomEntersAtDegrees) {
      phase = "bottom";
    } else if (knee >= SQUAT_THRESHOLDS.standingEntersAtDegrees && isStandingHeight && isUprightHip) {
      const durationMs = currentRepStartedAtMs === null ? 0 : timestampMs - currentRepStartedAtMs;
      const reachedHalfDepth = (currentRepMinimumKneeAngle !== null && currentRepMinimumKneeAngle <= SQUAT_THRESHOLDS.halfSquatEntersBelowDegrees)
        || ((currentRepMaximumRelativeDepth ?? 0) >= 0.35);

      if (
        durationMs >= SQUAT_THRESHOLDS.minimumRepDurationMs
        && durationMs <= SQUAT_THRESHOLDS.maximumRepDurationMs
        && reachedHalfDepth
      ) {
        const minAngle = currentRepMinimumKneeAngle;
        const maxRelDepth = currentRepMaximumRelativeDepth ?? 0;
        const repRom = calculateSquatRom(minAngle, maxRelDepth);
        const isFull = minAngle <= SQUAT_THRESHOLDS.bottomEntersAtDegrees || repRom >= 85;
        const classification: SquatClassification = isFull ? "full" : "half";
        const tempo = calculateSquatTempo(
          currentRepStartedAtMs ?? timestampMs - durationMs,
          currentRepBottomEnteredAtMs,
          currentRepAscentStartedAtMs,
          timestampMs,
        );
        const symmetry = calculateSquatSymmetry(
          currentRepMinLeftKnee,
          currentRepMinRightKnee,
          currentRepMaxHipHeightDiff,
          standingThighLength,
        );

        if (isFull) {
          fullReps += 1;
        } else {
          halfReps += 1;
        }
        reps = halfReps + fullReps;
        lastRep = {
          durationMs,
          minimumKneeAngle: minAngle,
          classification,
          romPercent: repRom,
          relativeDepth: Math.round(maxRelDepth * 100) / 100,
          tempo,
          symmetry,
        };
        repsHistory = [...repsHistory, lastRep];
      }
      phase = "standing";
      currentRepStartedAtMs = null;
      currentRepBottomEnteredAtMs = null;
      currentRepAscentStartedAtMs = null;
      currentRepMinimumKneeAngle = null;
      currentRepMaximumRelativeDepth = null;
      currentRepMinLeftKnee = null;
      currentRepMinRightKnee = null;
      currentRepMaxHipHeightDiff = null;
    }
  }

  return {
    ...state,
    phase,
    reps,
    halfReps,
    fullReps,
    measurement,
    tracking: true,
    lastTimestampMs: timestampMs,
    lastReliableAtMs: timestampMs,
    currentRepStartedAtMs,
    currentRepBottomEnteredAtMs,
    currentRepAscentStartedAtMs,
    currentRepMinimumKneeAngle,
    currentRepMaximumRelativeDepth,
    currentRepMinLeftKnee,
    currentRepMinRightKnee,
    currentRepMaxHipHeightDiff,
    lastRep,
    repsHistory,
    samples: state.samples + 1,
    trackedSamples: state.trackedSamples + 1,
    bothSidesSamples: state.bothSidesSamples + (measurement.trackedSides === 2 ? 1 : 0),
    minimumKneeAngle: Math.min(state.minimumKneeAngle ?? knee, knee),
    maximumKneeAngle: Math.max(state.maximumKneeAngle ?? knee, knee),
    standingHipY,
    standingThighLength,
    currentRomPercent: currentRom,
  };
}

function roundedPercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function roundedAngle(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export function buildSquatTestReport(
  state: SquatTrackerState,
  createdAt: string,
  protocol: "rom-step-24" | "tempo-step-25" | "symmetry-step-26" = "rom-step-24",
): SquatTestReport {
  let tempoAnalysis: SquatTempoAnalysis | undefined = undefined;
  const repsWithTempo = state.repsHistory.filter((r): r is SquatRepSummary & { tempo: SquatTempoBreakdown } => Boolean(r.tempo));
  if (repsWithTempo.length > 0) {
    const totalEcc = repsWithTempo.reduce((sum, r) => sum + r.tempo.eccentricMs, 0);
    const totalBot = repsWithTempo.reduce((sum, r) => sum + r.tempo.bottomMs, 0);
    const totalCon = repsWithTempo.reduce((sum, r) => sum + r.tempo.concentricMs, 0);
    const count = repsWithTempo.length;

    const hasSlowEccentric = repsWithTempo.some((r) => r.tempo.eccentricMs >= 2200);
    const hasPauseBottom = repsWithTempo.some((r) => r.tempo.bottomMs >= 1500);
    const hasNormal = repsWithTempo.some((r) => r.tempo.eccentricMs < 2000 && r.tempo.bottomMs < 1000);

    const variations = [hasNormal, hasSlowEccentric, hasPauseBottom].filter(Boolean).length;

    tempoAnalysis = {
      averageEccentricMs: Math.round(totalEcc / count),
      averageBottomMs: Math.round(totalBot / count),
      averageConcentricMs: Math.round(totalCon / count),
      variationsDetected: variations,
      tempoPassed: variations >= 2 && state.reps >= 3,
    };
  }

  let symmetryAnalysis: SquatSymmetryAnalysis | undefined = undefined;
  const repsWithSymmetry = state.repsHistory.filter((r): r is SquatRepSummary & { symmetry: SquatSymmetryBreakdown } => Boolean(r.symmetry));
  if (repsWithSymmetry.length > 0) {
    const totalScore = repsWithSymmetry.reduce((sum, r) => sum + r.symmetry.symmetryScore, 0);
    const averageSymmetryScore = Math.round(totalScore / repsWithSymmetry.length);
    const asymmetricRepsCount = repsWithSymmetry.filter((r) => r.symmetry.symmetryScore < 85).length;
    const symmetricRepsCount = repsWithSymmetry.filter((r) => r.symmetry.symmetryScore >= 85).length;
    symmetryAnalysis = {
      averageSymmetryScore,
      asymmetricRepsCount,
      symmetricRepsCount,
      symmetryPassed: repsWithSymmetry.length >= 3 && (asymmetricRepsCount >= 1 || averageSymmetryScore >= 75),
    };
  }

  let romClassificationPassed = false;
  let expectedProtocolResult = "";
  if (protocol === "tempo-step-25") {
    romClassificationPassed = Boolean(tempoAnalysis?.tempoPassed);
    expectedProtocolResult = "3 tempo variations demonstrated: normal (~1-0-1), slow eccentric 3s (~3-0-1), and bottom pause 2s (~2-2-1)";
  } else if (protocol === "symmetry-step-26") {
    romClassificationPassed = Boolean(symmetryAnalysis?.symmetryPassed);
    expectedProtocolResult = "3 reps analyzed for bilateral symmetry with safe non-diagnostic observations";
  } else {
    romClassificationPassed = (state.halfReps >= 10 && state.fullReps >= 10) || state.reps >= 20;
    expectedProtocolResult = "10 half chair squats + 10 full free squats = 20 classified reps";
  }

  return {
    version: 2,
    kind: "motion-squat-test",
    createdAt,
    protocol,
    containsRawVideo: false,
    reps: state.reps,
    halfReps: state.halfReps,
    fullReps: state.fullReps,
    phase: state.phase,
    trackingQualityPercent: roundedPercent(state.trackedSamples, state.samples),
    bothSidesPercent: roundedPercent(state.bothSidesSamples, state.samples),
    kneeAngleRange: {
      minimum: roundedAngle(state.minimumKneeAngle),
      maximum: roundedAngle(state.maximumKneeAngle),
    },
    userGeometry: {
      standingKneeAngle: roundedAngle(state.maximumKneeAngle),
      thighLength: state.standingThighLength !== null ? Math.round(state.standingThighLength * 1_000) / 1_000 : null,
      shinLength: state.measurement.shinLength ? Math.round(state.measurement.shinLength * 1_000) / 1_000 : null,
    },
    lastRep: state.lastRep
      ? {
          durationMs: Math.round(state.lastRep.durationMs),
          minimumKneeAngle: roundedAngle(state.lastRep.minimumKneeAngle) ?? 0,
          classification: state.lastRep.classification,
          romPercent: state.lastRep.romPercent,
          relativeDepth: state.lastRep.relativeDepth,
          tempo: state.lastRep.tempo,
          symmetry: state.lastRep.symmetry,
        }
      : null,
    repsHistory: state.repsHistory,
    romClassificationPassed,
    expectedProtocolResult,
    tempoAnalysis,
    symmetryAnalysis,
  };
}

export const SQUAT_PHASE_LABELS: Record<SquatPhase, string> = {
  waiting: "Ställ dig upp i bild",
  standing: "Stående",
  descending: "På väg ned",
  bottom: "Bottenläge (sittande)",
  ascending: "På väg upp",
};

export function squatTestInstruction(
  state: SquatTrackerState,
  protocol: "rom-step-24" | "tempo-step-25" | "symmetry-step-26" | "workout-step-31" = "rom-step-24",
): string {
  if (protocol === "workout-step-31") {
    return "Steg 31 Passmotor: Genomför 3 set med 10 repetitioner. Systemet räknar reps, sköter vilan och loggar passet hands-free.";
  }

  if (protocol === "symmetry-step-26") {
    if (state.reps === 0) {
      return "Steg 26 Symmetri: Gör rep 1 med jämn balans, rep 2 med lätt sidoförskjutning, och rep 3 mot andra sidan.";
    }
    if (state.reps === 1) {
      return `Repetition 1 klar (${state.lastRep?.symmetry?.observation ?? "balanserad"})! Gör rep 2 med lätt förskjutning åt ena hållet.`;
    }
    if (state.reps === 2) {
      return `Repetition 2 klar (${state.lastRep?.symmetry?.observation ?? "observerad"})! Gör rep 3 med lätt förskjutning åt andra hållet.`;
    }
    return `Steg 26 godkänt! ${state.reps} repetitioner analyserade för bilateral knä- och höftsymmetri.`;
  }

  if (protocol === "tempo-step-25") {
    if (state.reps === 0) {
      return "Steg 25 Tempo: Gör 1 vanlig repetition, 1 långsam kontrollerad (3s ned), och 1 pausknäböj (2s i botten).";
    }
    if (state.reps === 1) {
      return `Repetition 1 klar (${state.lastRep?.tempo?.notation ?? "1-0-1"})! Gör rep 2 med långsam nedgång (3 sekunder ned).`;
    }
    if (state.reps === 2) {
      return `Repetition 2 klar (${state.lastRep?.tempo?.notation ?? "3-0-1"})! Gör rep 3 med paus i bottenläget (håll 2 sekunder).`;
    }
    return `Steg 25 godkänt! ${state.reps} repetitioner loggade med analyserade tempofaser (${state.lastRep?.tempo?.notation ?? ""}).`;
  }

  if (state.halfReps < 10) {
    return `Stolstest: Gör 10 halva mot stolen (${state.halfReps}/10 klara). Ta sedan bort stolen för 10 fulla.`;
  }
  if (state.fullReps < 10) {
    return `Tio halva klara! Gör nu 10 djupa knäböj utan stol (${state.fullReps}/10 klara).`;
  }
  return `Steg 24 godkänt! ${state.halfReps} halva med stol och ${state.fullReps} fulla djupa böj.`;
}

/** Keeps spoken coaching deterministic and separate from browser speech synthesis. */
export function squatVoiceCue(
  previous: SquatTrackerState,
  next: SquatTrackerState,
  protocol: "rom-step-24" | "tempo-step-25" | "symmetry-step-26" = "rom-step-24",
): SquatVoiceCue | null {
  // 1. Rep completed: milestones and counts
  if (next.reps > previous.reps && next.lastRep) {
    const rep = next.lastRep;
    if (protocol === "symmetry-step-26") {
      const obs = rep.symmetry?.observation ?? "Rörelsen registrerad.";
      if (next.reps === 1) {
        return {
          text: `Repetition ett klar. ${obs} Gör repetition två med avsiktlig lätt förskjutning åt ena hållet.`,
          priority: true,
          sound: "rep",
        };
      }
      if (next.reps === 2) {
        return {
          text: `Repetition två klar. ${obs} Gör repetition tre med lätt förskjutning åt andra hållet.`,
          priority: true,
          sound: "rep",
        };
      }
      if (next.reps === 3) {
        return {
          text: `Tre repetitioner klara. ${obs} Symmetritestet är godkänt!`,
          priority: true,
          sound: "milestone",
        };
      }
      return { text: `Repetition ${next.reps}. ${obs}`, priority: false, sound: "rep" };
    }

    if (protocol === "tempo-step-25") {
      const notation = rep.tempo?.notation ?? "tempo";
      if (next.reps === 1) {
        return {
          text: `Repetition ett klar, tempo ${notation}. Gör repetition två med långsam kontrollerad nedgång på tre sekunder.`,
          priority: true,
          sound: "rep",
        };
      }
      if (next.reps === 2) {
        return {
          text: `Repetition två klar, tempo ${notation}. Gör repetition tre med två sekunders paus i bottenläget.`,
          priority: true,
          sound: "rep",
        };
      }
      if (next.reps === 3) {
        return {
          text: `Tre repetitioner klara, tempo ${notation}! Steg tjugofem godkänt. Mycket bra tempo-kontroll!`,
          priority: true,
          sound: "milestone",
        };
      }
      return { text: `Repetition ${next.reps}, tempo ${notation}.`, priority: false, sound: "rep" };
    }

    if (rep.classification === "half") {
      if (next.halfReps === 10) {
        return {
          text: "Tio halva klara! Mycket bra. Ta bort stolen och kör tio djupa böj.",
          priority: true,
          sound: "milestone",
        };
      }
      return { text: `Halv ${next.halfReps}.`, priority: false, sound: "rep" };
    }
    if (rep.classification === "full") {
      if (next.fullReps === 10) {
        return {
          text: "Tio fulla klara! ROM-testet är godkänt! Fantastiskt jobbat.",
          priority: true,
          sound: "milestone",
        };
      }
      return { text: `Full ${next.fullReps}.`, priority: false, sound: "rep" };
    }
  }

  // 2. Real-time cue when reaching bottom or turnaround
  if (
    (previous.phase !== "bottom" && next.phase === "bottom")
    || (previous.phase === "descending" && next.phase === "ascending")
  ) {
    return { text: "Där, res dig!", priority: true, sound: "full-depth" };
  }

  // 3. Shallow rep aborted before depth reached
  if (
    previous.phase === "descending"
    && next.phase === "standing"
    && next.reps === previous.reps
  ) {
    return {
      text: "Sätt dig lite djupare mot stolen innan du reser dig.",
      priority: false,
      sound: "warning",
    };
  }

  // 4. Lost tracking
  if (previous.phase !== "waiting" && next.phase === "waiting" && !next.tracking) {
    return {
      text: "Jag ser inte hela kroppen. Ta ett halvt steg bakåt så fortsätter vi.",
      priority: true,
      sound: "warning",
    };
  }

  // 5. Standing ready
  if (previous.phase === "waiting" && next.phase === "standing" && next.tracking) {
    if (next.reps === 0) {
      if (protocol === "symmetry-step-26") {
        return {
          text: "Symmetritest redo! Gör rep ett med jämn balans, och därefter två med lätt sidoförskjutning.",
          priority: true,
        };
      }
      if (protocol === "tempo-step-25") {
        return {
          text: "Redo! Gör en vanlig knäböj, en långsam på tre sekunder, och en med paus i botten.",
          priority: true,
        };
      }
      return {
        text: "Perfekt! Kör tio mot stolen för halva böj, och tio utan stol för fulla.",
        priority: true,
      };
    }
    return {
      text: "Där ser jag dig igen! Fortsätt när du är redo.",
      priority: false,
    };
  }

  return null;
}

