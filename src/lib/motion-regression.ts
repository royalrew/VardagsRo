import type { MotionLandmark, MotionRecordedFrame } from "./motion-engine";
import {
  advanceJumpingJackTracker,
  advanceLungeTracker,
  advancePlankTracker,
  advancePushupTracker,
  createJumpingJackTrackerState,
  createLungeTrackerState,
  createPlankTrackerState,
  createPushupTrackerState,
  type ExerciseType,
} from "./motion-exercises";
import {
  advanceSquatTracker,
  createSquatTrackerState,
  measureSquatAngles,
} from "./motion-squat";

export interface MotionRegressionRecording {
  id: string;
  name: string;
  exercise: ExerciseType;
  expectedReps: number;
  frames: readonly MotionRecordedFrame[];
}

export interface RegressionDiagnosis {
  recordingId: string;
  exercise: ExerciseType;
  expectedReps: number;
  detectedReps: number;
  passed: boolean;
  reason?: string;
}

export interface MotionRegressionSuiteResult {
  totalDatasets: number;
  passedDatasets: number;
  failedDatasets: number;
  overallPassed: boolean;
  diagnoses: readonly RegressionDiagnosis[];
}

function point(x: number, y: number, visibility = 0.95): MotionLandmark {
  return { x, y, z: 0, visibility };
}

/**
 * Creates deterministic golden benchmark datasets for all 5 core exercises.
 */
export function createGoldenBenchmarkDatasets(): readonly MotionRegressionRecording[] {
  // 1. Golden Squat (Standing -> Bottom -> Standing)
  const squatStanding = Array.from({ length: 33 }, () => point(0.5, 0.5));
  squatStanding[11] = point(0.35, 0.20);
  squatStanding[12] = point(0.65, 0.20);
  squatStanding[23] = point(0.40, 0.45);
  squatStanding[24] = point(0.60, 0.45);
  squatStanding[25] = point(0.40, 0.70);
  squatStanding[26] = point(0.60, 0.70);
  squatStanding[27] = point(0.40, 0.95);
  squatStanding[28] = point(0.60, 0.95);

  const squatBottom = Array.from({ length: 33 }, () => point(0.5, 0.5));
  squatBottom[11] = point(0.35, 0.40);
  squatBottom[12] = point(0.65, 0.40);
  squatBottom[23] = point(0.40, 0.75); // deep hips
  squatBottom[24] = point(0.60, 0.75);
  squatBottom[25] = point(0.30, 0.75); // knee angle ~80 deg
  squatBottom[26] = point(0.70, 0.75);
  squatBottom[27] = point(0.35, 0.95);
  squatBottom[28] = point(0.65, 0.95);

  const squatFrames: MotionRecordedFrame[] = [
    { offsetMs: 0, inferenceMs: 15, landmarks: squatStanding },
    { offsetMs: 1000, inferenceMs: 15, landmarks: squatBottom },
    { offsetMs: 2000, inferenceMs: 15, landmarks: squatStanding },
  ];

  // 2. Golden Lunge
  const lungeStanding = Array.from({ length: 33 }, () => point(0.5, 0.5));
  lungeStanding[23] = point(0.45, 0.45);
  lungeStanding[25] = point(0.45, 0.70);
  lungeStanding[27] = point(0.45, 0.95);
  lungeStanding[24] = point(0.55, 0.45);
  lungeStanding[26] = point(0.55, 0.70);
  lungeStanding[28] = point(0.55, 0.95);

  const lungeBottom = Array.from({ length: 33 }, () => point(0.5, 0.5));
  lungeBottom[23] = point(0.38, 0.75);
  lungeBottom[25] = point(0.58, 0.75);
  lungeBottom[27] = point(0.58, 0.95);
  lungeBottom[24] = point(0.38, 0.75);
  lungeBottom[26] = point(0.20, 0.85);
  lungeBottom[28] = point(0.15, 0.95);

  const lungeFrames: MotionRecordedFrame[] = [
    { offsetMs: 0, inferenceMs: 15, landmarks: lungeStanding },
    { offsetMs: 1000, inferenceMs: 15, landmarks: lungeBottom },
    { offsetMs: 2000, inferenceMs: 15, landmarks: lungeStanding },
  ];

  // 3. Golden Pushup
  const pushupPlank = Array.from({ length: 33 }, () => point(0.5, 0.5));
  pushupPlank[11] = point(0.25, 0.65);
  pushupPlank[13] = point(0.25, 0.80);
  pushupPlank[15] = point(0.25, 0.95);
  pushupPlank[23] = point(0.55, 0.67);
  pushupPlank[27] = point(0.85, 0.69);

  const pushupBottom = Array.from({ length: 33 }, () => point(0.5, 0.5));
  pushupBottom[11] = point(0.25, 0.85);
  pushupBottom[13] = point(0.40, 0.85);
  pushupBottom[15] = point(0.25, 0.95);
  pushupBottom[23] = point(0.55, 0.87);
  pushupBottom[27] = point(0.85, 0.89);

  const pushupFrames: MotionRecordedFrame[] = [
    { offsetMs: 0, inferenceMs: 15, landmarks: pushupPlank },
    { offsetMs: 1000, inferenceMs: 15, landmarks: pushupBottom },
    { offsetMs: 2000, inferenceMs: 15, landmarks: pushupPlank },
  ];

  // 4. Golden Jumping Jack
  const jackClosed = Array.from({ length: 33 }, () => point(0.5, 0.5));
  jackClosed[11] = point(0.45, 0.30);
  jackClosed[12] = point(0.55, 0.30);
  jackClosed[15] = point(0.42, 0.55);
  jackClosed[16] = point(0.58, 0.55);
  jackClosed[27] = point(0.48, 0.95);
  jackClosed[28] = point(0.52, 0.95);

  const jackOpen = Array.from({ length: 33 }, () => point(0.5, 0.5));
  jackOpen[11] = point(0.45, 0.30);
  jackOpen[12] = point(0.55, 0.30);
  jackOpen[15] = point(0.20, 0.15); // hands high/wide
  jackOpen[16] = point(0.80, 0.15);
  jackOpen[27] = point(0.25, 0.95); // feet wide
  jackOpen[28] = point(0.75, 0.95);

  const jackFrames: MotionRecordedFrame[] = [
    { offsetMs: 0, inferenceMs: 15, landmarks: jackClosed },
    { offsetMs: 500, inferenceMs: 15, landmarks: jackOpen },
    { offsetMs: 1000, inferenceMs: 15, landmarks: jackClosed },
  ];

  // 5. Golden Plank (3 frames holding straight line)
  const plankHold = Array.from({ length: 33 }, () => point(0.5, 0.5));
  plankHold[11] = point(0.20, 0.70);
  plankHold[23] = point(0.50, 0.73);
  plankHold[27] = point(0.80, 0.76);

  const plankFrames: MotionRecordedFrame[] = [
    { offsetMs: 0, inferenceMs: 15, landmarks: plankHold },
    { offsetMs: 1000, inferenceMs: 15, landmarks: plankHold },
    { offsetMs: 2000, inferenceMs: 15, landmarks: plankHold },
  ];

  return [
    { id: "gold-squat-1", name: "Knäböj baseline", exercise: "squat", expectedReps: 1, frames: squatFrames },
    { id: "gold-lunge-1", name: "Utfall baseline", exercise: "lunge", expectedReps: 1, frames: lungeFrames },
    { id: "gold-pushup-1", name: "Armhävning baseline", exercise: "pushup", expectedReps: 1, frames: pushupFrames },
    { id: "gold-jack-1", name: "Jacks baseline", exercise: "jumping-jacks", expectedReps: 1, frames: jackFrames },
    { id: "gold-plank-1", name: "Planka baseline", exercise: "plank", expectedReps: 2, frames: plankFrames }, // 2 seconds hold
  ];
}

/**
 * Runs a single recording against its exercise state machine and checks for regression.
 */
export function detectRegressionInDataset(
  recording: MotionRegressionRecording,
): RegressionDiagnosis {
  let detectedReps = 0;

  if (recording.exercise === "squat") {
    let state = createSquatTrackerState();
    for (const frame of recording.frames) {
      const angles = measureSquatAngles(frame.landmarks, 1);
      state = advanceSquatTracker(state, angles, 1000 + frame.offsetMs);
    }
    detectedReps = state.reps;
  } else if (recording.exercise === "lunge") {
    let state = createLungeTrackerState();
    for (const frame of recording.frames) {
      state = advanceLungeTracker(state, frame.landmarks, 1000 + frame.offsetMs);
    }
    detectedReps = state.reps;
  } else if (recording.exercise === "pushup") {
    let state = createPushupTrackerState();
    for (const frame of recording.frames) {
      state = advancePushupTracker(state, frame.landmarks, 1000 + frame.offsetMs);
    }
    detectedReps = state.reps;
  } else if (recording.exercise === "jumping-jacks") {
    let state = createJumpingJackTrackerState();
    for (const frame of recording.frames) {
      state = advanceJumpingJackTracker(state, frame.landmarks, 1000 + frame.offsetMs);
    }
    detectedReps = state.reps;
  } else if (recording.exercise === "plank") {
    let state = createPlankTrackerState();
    for (const frame of recording.frames) {
      state = advancePlankTracker(state, frame.landmarks, 1000 + frame.offsetMs);
    }
    detectedReps = Math.round(state.holdTimeMs / 1000);
  }

  const passed = detectedReps === recording.expectedReps;
  return {
    recordingId: recording.id,
    exercise: recording.exercise,
    expectedReps: recording.expectedReps,
    detectedReps,
    passed,
    reason: passed
      ? undefined
      : `Rep-avvikelse: Förväntade ${recording.expectedReps}, men detekterade ${detectedReps}`,
  };
}

/**
 * Runs the full regression suite on all datasets and aggregates metrics.
 */
export function runMotionRegressionSuite(
  datasets: readonly MotionRegressionRecording[],
): MotionRegressionSuiteResult {
  const diagnoses = datasets.map((d) => detectRegressionInDataset(d));
  const passedDatasets = diagnoses.filter((d) => d.passed).length;
  const failedDatasets = diagnoses.filter((d) => !d.passed).length;

  return {
    totalDatasets: datasets.length,
    passedDatasets,
    failedDatasets,
    overallPassed: failedDatasets === 0,
    diagnoses,
  };
}
