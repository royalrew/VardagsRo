import type { MotionLandmark } from "./motion-engine";
import type { TrackableExerciseId } from "./motion-library";

export type CameraPlacement = "low-upward" | "eye-level" | "high-downward";

export interface CameraPitchEstimate {
  placement: CameraPlacement;
  isPitchTilted: boolean;
  torsoToLegRatio: number;
}

export type StanceOrientation = "front" | "diagonal" | "profile";

export interface UserOrientationEstimate {
  stance: StanceOrientation;
  estimatedYawDegrees: number;
}

export type FramingIssue =
  | "overhead-clipped"
  | "feet-clipped"
  | "too-close"
  | "too-far"
  | "suboptimal-angle"
  | "low-camera-tilt"
  | "high-camera-tilt";

export interface ExerciseFramingFeedback {
  isOptimal: boolean;
  issues: FramingIssue[];
  advice: string;
  badgeLabel: string;
  stance: StanceOrientation;
  placement: CameraPlacement;
}

/**
 * Computes rotation- and pitch-invariant 3D Euclidean angle between three joints (a -> b -> c).
 * Eliminates perspective compression from low/high cameras and diagonal poses.
 */
export function computeJointAngle3D(
  a: MotionLandmark,
  b: MotionLandmark,
  c: MotionLandmark,
  aspectRatio = 1,
): number | null {
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const ab = {
    x: (a.x - b.x) * safeAspect,
    y: a.y - b.y,
    z: (a.z ?? 0) - (b.z ?? 0),
  };
  const cb = {
    x: (c.x - b.x) * safeAspect,
    y: c.y - b.y,
    z: (c.z ?? 0) - (b.z ?? 0),
  };

  const abLen = Math.hypot(ab.x, ab.y, ab.z);
  const cbLen = Math.hypot(cb.x, cb.y, cb.z);
  if (abLen < 1e-6 || cbLen < 1e-6) return null;

  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const cosine = Math.min(1, Math.max(-1, dot / (abLen * cbLen)));
  return Math.acos(cosine) * (180 / Math.PI);
}

/**
 * Estimates camera vertical pitch / placement relative to user.
 * Low camera tilted up compresses torso relative to legs.
 * High camera tilted down compresses legs relative to torso.
 */
export function detectCameraPitch(landmarks: readonly MotionLandmark[]): CameraPitchEstimate {
  if (!landmarks || landmarks.length < 29) {
    return { placement: "eye-level", isPitchTilted: false, torsoToLegRatio: 1.0 };
  }

  const nose = landmarks[0];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const avgHipY = (leftHip.y + rightHip.y) / 2;
  const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
  const noseY = nose.y;

  const torsoHeight = Math.max(0.05, avgHipY - noseY);
  const legHeight = Math.max(0.05, avgAnkleY - avgHipY);

  const ratio = torsoHeight / legHeight;

  if (ratio < 0.65) {
    return {
      placement: "low-upward",
      isPitchTilted: true,
      torsoToLegRatio: Math.round(ratio * 100) / 100,
    };
  }

  if (ratio > 1.45) {
    return {
      placement: "high-downward",
      isPitchTilted: true,
      torsoToLegRatio: Math.round(ratio * 100) / 100,
    };
  }

  return {
    placement: "eye-level",
    isPitchTilted: false,
    torsoToLegRatio: Math.round(ratio * 100) / 100,
  };
}

/**
 * Estimates the user's yaw angle (stance orientation) relative to camera.
 * Front (0°-25°), Diagonal (25°-65°), Profile (65°-90°).
 */
export function detectUserOrientation(landmarks: readonly MotionLandmark[]): UserOrientationEstimate {
  if (!landmarks || landmarks.length < 25) {
    return { stance: "front", estimatedYawDegrees: 0 };
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  // Depth separation in z across shoulders and hips
  const shoulderDepthDelta = Math.abs((leftShoulder.z ?? 0) - (rightShoulder.z ?? 0));
  const hipDepthDelta = Math.abs((leftHip.z ?? 0) - (rightHip.z ?? 0));
  const avgDepthDelta = (shoulderDepthDelta + hipDepthDelta) / 2;

  // Horizontal span in x
  const shoulderWidthX = Math.abs(rightShoulder.x - leftShoulder.x);

  // Geometric yaw estimation: tan(yaw) = depthDelta / widthX
  const yawRad = Math.atan2(avgDepthDelta, Math.max(0.02, shoulderWidthX));
  const yawDegrees = Math.min(90, Math.max(0, Math.round(yawRad * (180 / Math.PI))));

  let stance: StanceOrientation = "front";
  if (yawDegrees >= 65) {
    stance = "profile";
  } else if (yawDegrees >= 25) {
    stance = "diagonal";
  }

  return {
    stance,
    estimatedYawDegrees: yawDegrees,
  };
}

/**
 * Comprehensive evaluator of user's physical camera framing for the selected exercise.
 * Returns actionable Swedish instructions if adjustment is needed.
 */
export function evaluateExerciseFraming(
  landmarks: readonly MotionLandmark[],
  exerciseId: TrackableExerciseId,
): ExerciseFramingFeedback {
  if (!landmarks || landmarks.length < 33) {
    return {
      isOptimal: false,
      issues: ["too-far"],
      advice: "Ingen kropp identifierad. Ställ dig framför kameran.",
      badgeLabel: "Söker person...",
      stance: "front",
      placement: "eye-level",
    };
  }

  const pitch = detectCameraPitch(landmarks);
  const orientation = detectUserOrientation(landmarks);
  const issues: FramingIssue[] = [];

  const nose = landmarks[0];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];

  const noseY = nose.y;
  const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
  const bodyHeight = avgAnkleY - noseY;

  // 1. Distance check
  if (bodyHeight > 0.88) {
    issues.push("too-close");
  } else if (bodyHeight < 0.35) {
    issues.push("too-far");
  }

  // 2. Headroom / Overhead check
  const requiresOverhead = exerciseId === "overhead-press" || exerciseId === "handstand-hold" || exerciseId === "jumping-jacks";
  if (requiresOverhead) {
    const highestPoint = Math.min(noseY, leftWrist.y, rightWrist.y);
    if (highestPoint < 0.08 || noseY < 0.14) {
      issues.push("overhead-clipped");
    }
  }

  // 3. Footroom / Floor check
  const requiresFloor = exerciseId === "calf-raise" || exerciseId === "squat" || exerciseId === "lunge" || exerciseId === "pushup" || exerciseId === "goblet-squat" || exerciseId === "bulgarian-split-squat" || exerciseId === "dumbbell-rdl";
  if (requiresFloor) {
    if (avgAnkleY > 0.96) {
      issues.push("feet-clipped");
    }
  }

  // 4. Stance angle check
  const requiresProfileOrDiagonal = exerciseId === "kettlebell-swing" || exerciseId === "bent-over-row" || exerciseId === "pushup" || exerciseId === "plank" || exerciseId === "bench-dips" || exerciseId === "pike-pushup" || exerciseId === "bulgarian-split-squat" || exerciseId === "dumbbell-rdl";
  if (requiresProfileOrDiagonal && orientation.stance === "front") {
    issues.push("suboptimal-angle");
  }

  // 5. Synthesize Actionable Swedish Advice
  let advice = "Bra kameravinkel och uppställning! Börja när du vill.";
  let badgeLabel = "Kameravinkel: Bra";

  if (issues.includes("overhead-clipped")) {
    advice = "Händerna riskerar att klippas högst upp. Vinkla upp telefonen lite eller backa ett steg.";
    badgeLabel = "⚠️ För snål takhöjd";
  } else if (issues.includes("feet-clipped")) {
    advice = "Fötterna och golvet syns dåligt. Vinkla ned kameran så att hälarna ryms i bild.";
    badgeLabel = "⚠️ Fötterna klipps";
  } else if (issues.includes("too-close")) {
    advice = "Du står lite för nära. Backa ett halvt steg för säkrare ledspårning.";
    badgeLabel = "⚠️ För nära kameran";
  } else if (issues.includes("too-far")) {
    advice = "Du står lite långt bort. Kliv lite närmare kameran.";
    badgeLabel = "⚠️ För långt bort";
  } else if (issues.includes("suboptimal-angle")) {
    advice = "Vänd dig snett (ca 45°) eller i profil så att höftfällningen och armbågarna syns.";
    badgeLabel = "💡 Vänd dig snett/i profil";
  } else if (pitch.placement === "low-upward") {
    badgeLabel = "Kamera låg (3D-kompenserad)";
  } else if (pitch.placement === "high-downward") {
    badgeLabel = "Kamera hög (3D-kompenserad)";
  } else if (orientation.stance === "diagonal") {
    badgeLabel = "Vinkel: Diagonal (3D-aktiv)";
  }

  return {
    isOptimal: issues.length === 0,
    issues,
    advice,
    badgeLabel,
    stance: orientation.stance,
    placement: pitch.placement,
  };
}
