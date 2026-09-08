import { describe, expect, it } from "vitest";

import type { MotionLandmark } from "../motion-engine";
import {
  classifyExerciseFromPose,
  type ExerciseClassificationResult,
} from "../motion-classifier";

function point(x: number, y: number): MotionLandmark {
  return { x, y, z: 0, visibility: 0.95 };
}

describe("Exercise Auto-Detect Classifier (Steg 79)", () => {
  it("classifies horizontal floor posture as plank or pushup with high confidence", () => {
    // Horizontal floor posture: shoulder 11/12, hip 23/24, ankle 27/28 all near y = 0.75
    const floorPose = Array.from({ length: 33 }, () => point(0.5, 0.5));
    floorPose[11] = point(0.30, 0.70); // shoulder
    floorPose[12] = point(0.30, 0.70);
    floorPose[23] = point(0.55, 0.72); // hip
    floorPose[24] = point(0.55, 0.72);
    floorPose[27] = point(0.85, 0.75); // ankle
    floorPose[28] = point(0.85, 0.75);

    const result = classifyExerciseFromPose(floorPose);
    expect(["plank", "pushup"]).toContain(result.detectedExercise);
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("classifies jumping jacks when arms and legs are wide in upright posture", () => {
    // Vertical posture with wrists high/wide and ankles wide
    const jackPose = Array.from({ length: 33 }, () => point(0.5, 0.5));
    jackPose[0] = point(0.5, 0.15); // nose
    jackPose[11] = point(0.40, 0.30); // shoulders
    jackPose[12] = point(0.60, 0.30);
    jackPose[15] = point(0.20, 0.15); // hands high and wide
    jackPose[16] = point(0.80, 0.15);
    jackPose[23] = point(0.45, 0.55); // hips
    jackPose[24] = point(0.55, 0.55);
    jackPose[27] = point(0.25, 0.90); // feet wide
    jackPose[28] = point(0.75, 0.90);

    const result = classifyExerciseFromPose(jackPose);
    expect(result.detectedExercise).toBe("jumping-jacks");
    expect(result.confidence).toBeGreaterThanOrEqual(0.80);
  });

  it("classifies lunges when legs are in an asymmetric split stance", () => {
    // Upright/sagittal pose with left knee forward and right knee back
    const lungePose = Array.from({ length: 33 }, () => point(0.5, 0.5));
    lungePose[11] = point(0.45, 0.25);
    lungePose[12] = point(0.55, 0.25);
    lungePose[23] = point(0.40, 0.55); // hips
    lungePose[24] = point(0.40, 0.55);
    lungePose[25] = point(0.58, 0.75); // front knee bent forward
    lungePose[27] = point(0.58, 0.95);
    lungePose[26] = point(0.20, 0.85); // back knee bent back
    lungePose[28] = point(0.15, 0.95);

    const result = classifyExerciseFromPose(lungePose);
    expect(result.detectedExercise).toBe("lunge");
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("classifies squats when user is upright with symmetric knee and hip flexion", () => {
    const squatPose = Array.from({ length: 33 }, () => point(0.5, 0.5));
    squatPose[11] = point(0.40, 0.30);
    squatPose[12] = point(0.60, 0.30);
    squatPose[23] = point(0.45, 0.60); // hips lowered
    squatPose[24] = point(0.55, 0.60);
    squatPose[25] = point(0.40, 0.70); // knees bent symmetrically
    squatPose[26] = point(0.60, 0.70);
    squatPose[27] = point(0.42, 0.90); // ankles
    squatPose[28] = point(0.58, 0.90);

    const result = classifyExerciseFromPose(squatPose);
    expect(result.detectedExercise).toBe("squat");
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("returns null with low confidence when posture is ambiguous, enabling explicit fallback", () => {
    // Random ambiguous jumble
    const ambiguousPose = Array.from({ length: 33 }, () => point(0.5, 0.5));
    const result = classifyExerciseFromPose(ambiguousPose);
    expect(result.detectedExercise).toBeNull();
    expect(result.confidence).toBeLessThan(0.70);
  });
});
