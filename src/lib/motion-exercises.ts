import type { MotionLandmark } from "./motion-engine";

export type ExerciseType = "squat" | "lunge" | "pushup" | "jumping-jacks" | "plank";

export type CameraAngle = "front" | "side" | "diagonal";

export interface ExerciseProfile {
  id: ExerciseType;
  name: string;
  recommendedCameraAngle: CameraAngle;
  targetJoints: number[];
  description: string;
  cues: {
    start: string;
    formWarning: string;
    praise: string;
  };
}

/**
 * Exercise profile registry defining movement targets, required camera angles,
 * and form evaluation rules (Steg 75).
 */
export const EXERCISE_PROFILES: Record<ExerciseType, ExerciseProfile> = {
  squat: {
    id: "squat",
    name: "Knäböj",
    recommendedCameraAngle: "front",
    targetJoints: [11, 12, 23, 24, 25, 26, 27, 28],
    description: "Klassisk knäböj för ben- och sätesstyrka.",
    cues: {
      start: "Stå med fötterna axelbrett och tårna lätt utåt.",
      formWarning: "Sök fullt djup med höften under knähöjd.",
      praise: "Perfekt djup och upprätt överkropp!",
    },
  },
  lunge: {
    id: "lunge",
    name: "Utfall",
    recommendedCameraAngle: "side",
    targetJoints: [23, 24, 25, 26, 27, 28],
    description: "Utfallsteg för unilateral benstyrka och balans.",
    cues: {
      start: "Ta ett stort kliv framåt och sänk det bakre knät mot golvet.",
      formWarning: "Håll främre knät i 90 grader utan att det viker inåt.",
      praise: "Starkt och stabilt utfall!",
    },
  },
  pushup: {
    id: "pushup",
    name: "Armhävningar",
    recommendedCameraAngle: "side",
    targetJoints: [11, 12, 13, 14, 15, 16, 23, 24, 27, 28],
    description: "Bröst- och överkroppspress i rak plankposition.",
    cues: {
      start: "Ställ dig i plankposition med händerna under axlarna.",
      formWarning: "Håll kroppen spänd som en rak planka utan hängande höft.",
      praise: "Stark bröstpress och ren planklinje!",
    },
  },
  "jumping-jacks": {
    id: "jumping-jacks",
    name: "Jumping Jacks",
    recommendedCameraAngle: "front",
    targetJoints: [11, 12, 15, 16, 23, 24, 27, 28],
    description: "Helkroppsrörelse med armar över huvudet och fötter isär.",
    cues: {
      start: "Hoppa isär med fötterna och för händerna samman över huvudet.",
      formWarning: "Sträck ut armarna hela vägen ovanför axlarna.",
      praise: "Högt tempo och bra spänst!",
    },
  },
  plank: {
    id: "plank",
    name: "Planka",
    recommendedCameraAngle: "side",
    targetJoints: [11, 12, 23, 24, 27, 28],
    description: "Isometrisk bålstabilitet med neutral ryggrad.",
    cues: {
      start: "Håll en rak linje från axlar genom höft till hälar.",
      formWarning: "Håll en rak linje – lyft inte höften för högt.",
      praise: "Orubblig bålstabilitet!",
    },
  },
};

/**
 * Retrieves the exercise profile for the given exercise identifier.
 *
 * @param type - ExerciseType key.
 * @returns ExerciseProfile.
 */
export function getExerciseProfile(type: ExerciseType): ExerciseProfile {
  return EXERCISE_PROFILES[type];
}

export interface ExerciseCameraGuidance {
  angle: "front" | "side" | "front-or-45";
  instruction: string;
  warningNotice?: string;
}

/**
 * Returns actionable camera framing guidance and positioning instructions per exercise (Steg 76).
 *
 * @param type - Active exercise type.
 * @returns Camera angle guidance and instructions.
 */
export function getExerciseCameraGuidance(type: ExerciseType): ExerciseCameraGuidance {
  switch (type) {
    case "pushup":
      return {
        angle: "side",
        instruction: "Vänd dig 90° åt sidan så hela kroppen och armarna syns i profil.",
        warningNotice: "Kameran behöver se axlar, höfter och fötter från sidan.",
      };
    case "plank":
      return {
        angle: "side",
        instruction: "Vänd dig 90° med kroppen i profil mot kameran.",
        warningNotice: "Håll kroppen horisontell i bild.",
      };
    case "lunge":
      return {
        angle: "side",
        instruction: "Ställ dig 90° i profil så att främre och bakre knä syns tydligt.",
        warningNotice: "Se till att båda benen syns i rörelsen.",
      };
    case "jumping-jacks":
      return {
        angle: "front",
        instruction: "Ställ dig rakt framifrån med plats att sträcka ut armar och ben åt sidorna.",
      };
    case "squat":
    default:
      return {
        angle: "front-or-45",
        instruction: "Ställ dig framifrån eller 45° snett mot kameran så att höfter och knän syns.",
      };
  }
}

/**
 * Calculates 2D planar angle in degrees between three landmarks (a -> b -> c).
 */
export function computeJointAngle(
  a: MotionLandmark,
  b: MotionLandmark,
  c: MotionLandmark,
  aspectRatio = 1,
): number | null {
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const ab = { x: (a.x - b.x) * safeAspect, y: a.y - b.y };
  const cb = { x: (c.x - b.x) * safeAspect, y: c.y - b.y };
  const abLength = Math.hypot(ab.x, ab.y);
  const cbLength = Math.hypot(cb.x, cb.y);
  if (abLength < 1e-6 || cbLength < 1e-6) return null;
  const cosine = Math.min(1, Math.max(-1, (ab.x * cb.x + ab.y * cb.y) / (abLength * cbLength)));
  return Math.acos(cosine) * (180 / Math.PI);
}

// ---------------------------------------------------------------------------
// Steg 71: Lunge Tracker
// ---------------------------------------------------------------------------

export type LungePhase = "standing" | "descending" | "bottom" | "ascending";

export interface LungeTrackerState {
  phase: LungePhase;
  reps: number;
  leadLeg: "left" | "right" | null;
  kneeAngle: number;
  lastRepAtMs: number | null;
}

export function createLungeTrackerState(): LungeTrackerState {
  return {
    phase: "standing",
    reps: 0,
    leadLeg: null,
    kneeAngle: 180,
    lastRepAtMs: null,
  };
}

export function advanceLungeTracker(
  state: LungeTrackerState,
  landmarks: readonly MotionLandmark[],
  nowMs: number,
): LungeTrackerState {
  const leftHip = landmarks[23];
  const leftKnee = landmarks[25];
  const leftAnkle = landmarks[27];

  const rightHip = landmarks[24];
  const rightKnee = landmarks[26];
  const rightAnkle = landmarks[28];

  if (!leftHip || !leftKnee || !leftAnkle || !rightHip || !rightKnee || !rightAnkle) {
    return state;
  }

  const leftKneeAngle = computeJointAngle(leftHip, leftKnee, leftAnkle) ?? 180;
  const rightKneeAngle = computeJointAngle(rightHip, rightKnee, rightAnkle) ?? 180;

  // Lead leg is the one bending forward/deepest
  const isLeftLead = leftKneeAngle <= rightKneeAngle;
  const activeKneeAngle = isLeftLead ? leftKneeAngle : rightKneeAngle;
  const leadLeg = isLeftLead ? "left" : "right";

  let nextPhase = state.phase;
  let nextReps = state.reps;
  let lastRepAtMs = state.lastRepAtMs;

  if (state.phase === "standing") {
    if (activeKneeAngle <= 95) {
      nextPhase = "bottom";
    } else if (activeKneeAngle < 150) {
      nextPhase = "descending";
    }
  } else if (state.phase === "descending") {
    if (activeKneeAngle <= 95) {
      nextPhase = "bottom";
    } else if (activeKneeAngle > 155) {
      nextPhase = "standing";
    }
  } else if (state.phase === "bottom") {
    if (activeKneeAngle >= 150) {
      nextPhase = "standing";
      nextReps += 1;
      lastRepAtMs = nowMs;
    } else if (activeKneeAngle > 105) {
      nextPhase = "ascending";
    }
  } else if (state.phase === "ascending") {
    if (activeKneeAngle >= 155) {
      nextPhase = "standing";
      nextReps += 1;
      lastRepAtMs = nowMs;
    } else if (activeKneeAngle <= 95) {
      nextPhase = "bottom";
    }
  }

  return {
    ...state,
    phase: nextPhase,
    reps: nextReps,
    leadLeg: nextPhase === "standing" && state.phase !== "ascending" ? state.leadLeg : leadLeg,
    kneeAngle: Math.round(activeKneeAngle),
    lastRepAtMs,
  };
}

// ---------------------------------------------------------------------------
// Steg 72: Push-up Tracker
// ---------------------------------------------------------------------------

export type PushupPhase = "plank-top" | "descending" | "bottom" | "ascending";

export interface PushupRepSummary {
  repNumber: number;
  durationMs: number;
  minElbowAngle: number;
  lockoutElbowAngle: number;
  minBodyAlignmentDeg: number;
  isFormWarning: boolean;
  formMessage: string | null;
  startedAtMs: number;
  completedAtMs: number;
}

export interface PushupTrajectorySample {
  timestampMs: number;
  elbowAngle: number;
  bodyLineDeg: number;
  phase: PushupPhase;
}

export interface PushupTrackerState {
  phase: PushupPhase;
  reps: number;
  elbowAngle: number;
  bodyAlignmentDeg: number;
  isFormWarning: boolean;
  formMessage: string | null;
  side: "left" | "right";
  currentRepMinElbow?: number;
  currentRepStartedAtMs?: number;
  currentRepMinBodyDeg?: number;
  repsHistory: PushupRepSummary[];
  trajectorySamples: PushupTrajectorySample[];
  lastSampleAtMs?: number;
}

export function createPushupTrackerState(): PushupTrackerState {
  return {
    phase: "plank-top",
    reps: 0,
    elbowAngle: 180,
    bodyAlignmentDeg: 180,
    isFormWarning: false,
    formMessage: null,
    side: "left",
    repsHistory: [],
    trajectorySamples: [],
  };
}

export function advancePushupTracker(
  state: PushupTrackerState,
  landmarks: readonly MotionLandmark[],
  nowMs: number = performance.now(),
): PushupTrackerState {
  if (!landmarks || landmarks.length < 17) {
    return state;
  }

  // Calculate arm visibility:
  // Left arm: 11 (shoulder), 13 (elbow), 15 (wrist)
  // Right arm: 12 (shoulder), 14 (elbow), 16 (wrist)
  const leftVis =
    ((landmarks[11]?.visibility ?? 0) +
      (landmarks[13]?.visibility ?? 0) +
      (landmarks[15]?.visibility ?? 0)) /
    3;
  const rightVis =
    ((landmarks[12]?.visibility ?? 0) +
      (landmarks[14]?.visibility ?? 0) +
      (landmarks[16]?.visibility ?? 0)) /
    3;

  // Hysteresis to stay locked to the primary arm unless the other arm is clearly more visible
  let side: "left" | "right" = state.side ?? (leftVis >= rightVis ? "left" : "right");
  if (side === "left" && rightVis > leftVis + 0.35) {
    side = "right";
  } else if (side === "right" && leftVis > rightVis + 0.35) {
    side = "left";
  } else if (side === "left" && leftVis < 0.25 && rightVis >= 0.25) {
    side = "right";
  } else if (side === "right" && rightVis < 0.25 && leftVis >= 0.25) {
    side = "left";
  }

  const primaryShoulder = side === "left" ? landmarks[11] : landmarks[12];
  const primaryElbow = side === "left" ? landmarks[13] : landmarks[14];
  const primaryWrist = side === "left" ? landmarks[15] : landmarks[16];

  let shoulder = primaryShoulder;
  let elbow = primaryElbow;
  let wrist = primaryWrist;

  if (
    !shoulder ||
    !elbow ||
    !wrist ||
    (shoulder.visibility ?? 0) < 0.25 ||
    (elbow.visibility ?? 0) < 0.25
  ) {
    const altShoulder = side === "left" ? landmarks[12] : landmarks[11];
    const altElbow = side === "left" ? landmarks[14] : landmarks[13];
    const altWrist = side === "left" ? landmarks[16] : landmarks[15];
    if (
      altShoulder &&
      altElbow &&
      altWrist &&
      (altShoulder.visibility ?? 0) >= 0.25 &&
      (altElbow.visibility ?? 0) >= 0.25
    ) {
      shoulder = altShoulder;
      elbow = altElbow;
      wrist = altWrist;
    } else {
      return state;
    }
  }

  // Compute elbow angle:
  // In front or diagonal view, both arms might be clearly visible.
  let elbowAngle = computeJointAngle(shoulder, elbow, wrist) ?? 180;
  const otherSide = side === "left" ? "right" : "left";
  const otherShoulder = otherSide === "left" ? landmarks[11] : landmarks[12];
  const otherElbow = otherSide === "left" ? landmarks[13] : landmarks[14];
  const otherWrist = otherSide === "left" ? landmarks[15] : landmarks[16];
  if (
    otherShoulder &&
    otherElbow &&
    otherWrist &&
    (otherShoulder.visibility ?? 0) >= 0.4 &&
    (otherElbow.visibility ?? 0) >= 0.4
  ) {
    const altAngle = computeJointAngle(otherShoulder, otherElbow, otherWrist);
    if (altAngle !== null && altAngle >= 30 && altAngle <= 180) {
      elbowAngle = Math.min(elbowAngle, altAngle);
    }
  }

  // Body line (only when hips and ankles are visible, e.g. in diagonal or profile view)
  const hip = side === "left" ? (landmarks[23] ?? landmarks[24]) : (landmarks[24] ?? landmarks[23]);
  const ankle = side === "left" ? (landmarks[27] ?? landmarks[28]) : (landmarks[28] ?? landmarks[27]);
  const hasBodyLandmarks =
    hip &&
    ankle &&
    (hip.visibility ?? 0) >= 0.3 &&
    (ankle.visibility ?? 0) >= 0.25;

  const bodyLine = hasBodyLandmarks
    ? (computeJointAngle(shoulder, hip, ankle) ?? 180)
    : 180;

  const isFormWarning = hasBodyLandmarks && bodyLine < 140;
  const formMessage = isFormWarning ? "Håll kroppen spänd och lyft höften" : null;

  let nextPhase = state.phase;
  let nextReps = state.reps;
  let currentRepMinElbow = state.currentRepMinElbow ?? elbowAngle;
  let currentRepStartedAtMs = state.currentRepStartedAtMs;
  let currentRepMinBodyDeg = state.currentRepMinBodyDeg ?? bodyLine;
  const repsHistory = [...state.repsHistory];

  // Natural pushup thresholds for front and diagonal views
  const BOTTOM_THRESHOLD = 100;
  const LOCKOUT_THRESHOLD = 145;
  const DESCENDING_THRESHOLD = 135;
  const ASCENDING_THRESHOLD = 108;

  // Track min/max during active rep
  if (
    state.phase === "plank-top" &&
    (elbowAngle < DESCENDING_THRESHOLD || elbowAngle <= BOTTOM_THRESHOLD)
  ) {
    currentRepStartedAtMs = nowMs;
    currentRepMinElbow = elbowAngle;
    currentRepMinBodyDeg = bodyLine;
  } else {
    currentRepMinElbow = Math.min(currentRepMinElbow, elbowAngle);
    currentRepMinBodyDeg = Math.min(currentRepMinBodyDeg, bodyLine);
  }

  if (state.phase === "plank-top") {
    if (elbowAngle <= BOTTOM_THRESHOLD) {
      nextPhase = "bottom";
    } else if (elbowAngle < DESCENDING_THRESHOLD) {
      nextPhase = "descending";
    }
  } else if (state.phase === "descending") {
    if (elbowAngle <= BOTTOM_THRESHOLD) {
      nextPhase = "bottom";
    } else if (elbowAngle > LOCKOUT_THRESHOLD + 5) {
      nextPhase = "plank-top";
    }
  } else if (state.phase === "bottom") {
    if (elbowAngle >= LOCKOUT_THRESHOLD) {
      nextPhase = "plank-top";
      nextReps += 1;
      repsHistory.push({
        repNumber: nextReps,
        durationMs: currentRepStartedAtMs ? Math.round(nowMs - currentRepStartedAtMs) : 1500,
        minElbowAngle: Math.round(currentRepMinElbow),
        lockoutElbowAngle: Math.round(elbowAngle),
        minBodyAlignmentDeg: Math.round(currentRepMinBodyDeg),
        isFormWarning,
        formMessage,
        startedAtMs: currentRepStartedAtMs ?? (nowMs - 1500),
        completedAtMs: nowMs,
      });
      currentRepMinElbow = 180;
      currentRepStartedAtMs = undefined;
    } else if (elbowAngle > ASCENDING_THRESHOLD) {
      nextPhase = "ascending";
    }
  } else if (state.phase === "ascending") {
    if (elbowAngle >= LOCKOUT_THRESHOLD) {
      nextPhase = "plank-top";
      nextReps += 1;
      repsHistory.push({
        repNumber: nextReps,
        durationMs: currentRepStartedAtMs ? Math.round(nowMs - currentRepStartedAtMs) : 1500,
        minElbowAngle: Math.round(currentRepMinElbow),
        lockoutElbowAngle: Math.round(elbowAngle),
        minBodyAlignmentDeg: Math.round(currentRepMinBodyDeg),
        isFormWarning,
        formMessage,
        startedAtMs: currentRepStartedAtMs ?? (nowMs - 1500),
        completedAtMs: nowMs,
      });
      currentRepMinElbow = 180;
      currentRepStartedAtMs = undefined;
    } else if (elbowAngle <= BOTTOM_THRESHOLD) {
      nextPhase = "bottom";
    }
  }

  // Record downsampled trajectory samples (~15 Hz)
  let trajectorySamples = state.trajectorySamples;
  const lastSampleAt = state.lastSampleAtMs ?? 0;
  if (nowMs - lastSampleAt >= 65) {
    const newSample: PushupTrajectorySample = {
      timestampMs: Math.round(nowMs),
      elbowAngle: Math.round(elbowAngle),
      bodyLineDeg: Math.round(bodyLine),
      phase: nextPhase,
    };
    trajectorySamples = [...trajectorySamples.slice(-299), newSample];
  }

  return {
    ...state,
    phase: nextPhase,
    reps: nextReps,
    elbowAngle: Math.round(elbowAngle),
    bodyAlignmentDeg: Math.round(bodyLine),
    isFormWarning,
    formMessage,
    side,
    currentRepMinElbow,
    currentRepStartedAtMs,
    currentRepMinBodyDeg,
    repsHistory,
    trajectorySamples,
    lastSampleAtMs: nowMs,
  };
}

// ---------------------------------------------------------------------------
// Steg 73: Jumping Jacks Tracker
// ---------------------------------------------------------------------------

export type JumpingJackPhase = "closed" | "open";

export interface JumpingJackTrackerState {
  phase: JumpingJackPhase;
  reps: number;
}

export function createJumpingJackTrackerState(): JumpingJackTrackerState {
  return {
    phase: "closed",
    reps: 0,
  };
}

export function advanceJumpingJackTracker(
  state: JumpingJackTrackerState,
  landmarks: readonly MotionLandmark[],
  _nowMs: number,
): JumpingJackTrackerState {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) {
    return state;
  }

  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  const footDistance = Math.abs(rightAnkle.x - leftAnkle.x);

  // Arms overhead when wrists are higher than shoulders (y is smaller upwards)
  const armsOverhead = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y;
  const feetSpread = footDistance > shoulderWidth * 1.5;

  const isOpen = armsOverhead && feetSpread;
  const isClosed = !armsOverhead && footDistance < shoulderWidth * 1.2;

  let nextPhase = state.phase;
  let nextReps = state.reps;

  if (state.phase === "closed") {
    if (isOpen) {
      nextPhase = "open";
    }
  } else if (state.phase === "open") {
    if (isClosed) {
      nextPhase = "closed";
      nextReps += 1;
    }
  }

  return {
    ...state,
    phase: nextPhase,
    reps: nextReps,
  };
}

// ---------------------------------------------------------------------------
// Steg 74: Plank Tracker
// ---------------------------------------------------------------------------

export interface PlankTrackerState {
  isHolding: boolean;
  holdTimeMs: number;
  lastTimestampMs: number | null;
  bodyLineDeg: number;
  formWarning: string | null;
}

export function createPlankTrackerState(): PlankTrackerState {
  return {
    isHolding: false,
    holdTimeMs: 0,
    lastTimestampMs: null,
    bodyLineDeg: 180,
    formWarning: null,
  };
}

export function advancePlankTracker(
  state: PlankTrackerState,
  landmarks: readonly MotionLandmark[],
  nowMs: number,
): PlankTrackerState {
  const shoulder = landmarks[11];
  const hip = landmarks[23];
  const ankle = landmarks[27];

  if (!shoulder || !hip || !ankle) {
    return {
      ...state,
      isHolding: false,
      lastTimestampMs: nowMs,
    };
  }

  const bodyLine = computeJointAngle(shoulder, hip, ankle) ?? 180;
  // A good plank is relatively straight: 155° to 195°
  const isStraight = bodyLine >= 155 && bodyLine <= 195;

  let formWarning: string | null = null;
  if (!isStraight) {
    formWarning = "Håll en rak linje mellan axel, höft och fötter.";
  }

  let nextHoldTime = state.holdTimeMs;
  if (isStraight && state.lastTimestampMs !== null) {
    const elapsed = Math.max(0, nowMs - state.lastTimestampMs);
    nextHoldTime += elapsed;
  }

  return {
    ...state,
    isHolding: isStraight,
    holdTimeMs: nextHoldTime,
    lastTimestampMs: nowMs,
    bodyLineDeg: Math.round(bodyLine),
    formWarning,
  };
}
