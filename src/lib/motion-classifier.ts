import type { MotionLandmark } from "./motion-engine";
import type { ExerciseType } from "./motion-exercises";

export interface ExerciseClassificationResult {
  detectedExercise: ExerciseType | null;
  confidence: number;
  reason: string;
}

/**
 * Classifies the active exercise from kinematic pose geometry and orientation (Steg 79).
 * Returns null with low confidence if ambiguous, deferring to explicit user selection.
 *
 * @param landmarks - Current 33-point MediaPipe pose landmarks.
 * @returns ExerciseClassificationResult with detectedExercise, confidence and reason.
 */
export function classifyExerciseFromPose(
  landmarks: readonly MotionLandmark[],
): ExerciseClassificationResult {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  if (
    !leftShoulder || !rightShoulder ||
    !leftHip || !rightHip ||
    !leftAnkle || !rightAnkle
  ) {
    return {
      detectedExercise: null,
      confidence: 0,
      reason: "Otillräcklig posekvalitet för automatisk detektering",
    };
  }

  const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const avgHipY = (leftHip.y + rightHip.y) / 2;
  const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;

  const avgShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const avgHipX = (leftHip.x + rightHip.x) / 2;
  const avgAnkleX = (leftAnkle.x + rightAnkle.x) / 2;

  // 1. Horizontal posture check (Plank / Push-up)
  const isFloorLevel = avgShoulderY > 0.55 && avgHipY > 0.55;
  const isHorizontalTorso = Math.abs(avgShoulderY - avgHipY) < 0.18;
  const isHorizontalLegs = Math.abs(avgHipY - avgAnkleY) < 0.18;
  const isHorizontalSpan = Math.abs(avgShoulderX - avgAnkleX) > 0.35;

  if (isFloorLevel && isHorizontalTorso && isHorizontalLegs && isHorizontalSpan) {
    // Check if elbows are deeply flexed (push-up) or extended/forearm supported (plank)
    let isPushup = false;
    if (leftElbow && rightElbow && leftWrist && rightWrist) {
      const elbowY = (leftElbow.y + rightElbow.y) / 2;
      isPushup = elbowY < avgShoulderY - 0.05 || elbowY > avgShoulderY + 0.08;
    }
    return {
      detectedExercise: isPushup ? "pushup" : "plank",
      confidence: 0.88,
      reason: isPushup ? "Horisontell golvposition med armhävningsrörelse" : "Horisontell rak bållinje mot golvet (Planka)",
    };
  }

  // 2. Vertical posture check
  const isVertical = avgShoulderY < avgHipY - 0.15 && avgHipY < avgAnkleY - 0.15;
  if (!isVertical) {
    return {
      detectedExercise: null,
      confidence: 0.3,
      reason: "Kroppsvinkeln är tvetydig eller övergångsrörelse",
    };
  }

  // 3. Jumping Jacks check (arms high or wide + feet wide)
  if (leftWrist && rightWrist) {
    const feetSpread = Math.abs(leftAnkle.x - rightAnkle.x);
    const handsHigh = leftWrist.y < avgShoulderY && rightWrist.y < avgShoulderY;
    const handsWide = Math.abs(leftWrist.x - rightWrist.x) > 0.5;

    if ((handsHigh || handsWide) && feetSpread > 0.35) {
      return {
        detectedExercise: "jumping-jacks",
        confidence: 0.92,
        reason: "Breda armar/ben i upprätt position (Jumping Jacks)",
      };
    }
  }

  // 4. Lunge check (Sagittal / asymmetric knee split)
  if (leftKnee && rightKnee) {
    const kneeDiffX = Math.abs(leftKnee.x - rightKnee.x);
    const ankleDiffX = Math.abs(leftAnkle.x - rightAnkle.x);

    if (kneeDiffX > 0.22 && ankleDiffX > 0.25) {
      return {
        detectedExercise: "lunge",
        confidence: 0.86,
        reason: "Asymmetrisk split-position för benen (Utfall)",
      };
    }
  }

  // 5. Squat check (Symmetric knee flexion)
  if (leftKnee && rightKnee) {
    const kneesLevel = Math.abs(leftKnee.y - rightKnee.y) < 0.12;
    const kneesBent = leftKnee.y < avgAnkleY - 0.10 && rightKnee.y < avgAnkleY - 0.10;
    const hipsLowered = avgHipY > 0.50;

    if (kneesLevel && kneesBent && hipsLowered) {
      return {
        detectedExercise: "squat",
        confidence: 0.89,
        reason: "Symmetrisk böjning i höft och knän (Knäböj)",
      };
    }
  }

  return {
    detectedExercise: null,
    confidence: 0.45,
    reason: "Ingen entydig övningsrörelse detekterad",
  };
}
