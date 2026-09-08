import { describe, expect, it } from "vitest";

import type { MotionLandmark } from "../motion-engine";
import {
  createGoldenBenchmarkDatasets,
  detectRegressionInDataset,
  runMotionRegressionSuite,
  type MotionRegressionRecording,
} from "../motion-regression";

describe("Motion Engine Regression Suite (Steg 84)", () => {
  it("generates golden landmark datasets covering squats, lunges, pushups, jumping jacks, and planks", () => {
    const datasets = createGoldenBenchmarkDatasets();
    expect(datasets.length).toBe(5);

    const exercises = datasets.map((d) => d.exercise);
    expect(exercises).toContain("squat");
    expect(exercises).toContain("lunge");
    expect(exercises).toContain("pushup");
    expect(exercises).toContain("jumping-jacks");
    expect(exercises).toContain("plank");

    for (const dataset of datasets) {
      expect(dataset.frames.length).toBeGreaterThanOrEqual(3);
      expect(dataset.expectedReps).toBeGreaterThanOrEqual(1);
    }
  });

  it("evaluates all golden benchmark datasets with zero regressions under normal thresholds", () => {
    const datasets = createGoldenBenchmarkDatasets();
    const result = runMotionRegressionSuite(datasets);

    expect(result.totalDatasets).toBe(5);
    expect(result.passedDatasets).toBe(5);
    expect(result.failedDatasets).toBe(0);
    expect(result.overallPassed).toBe(true);
  });

  it("detects and flags intentional regression when landmark noise or threshold corruption is introduced", () => {
    const datasets = createGoldenBenchmarkDatasets();
    const squatDataset = datasets.find((d) => d.exercise === "squat")!;

    // Introduce corrupted/collapsed frames (simulate tracking failure)
    const corruptedFrames = squatDataset.frames.map((frame) => ({
      ...frame,
      landmarks: frame.landmarks.map(() => ({ x: 0, y: 0, z: 0, visibility: 0.1 })),
    }));

    const corruptedDataset: MotionRegressionRecording = {
      ...squatDataset,
      id: "corrupted-squat",
      frames: corruptedFrames,
    };

    const diagnosis = detectRegressionInDataset(corruptedDataset);
    expect(diagnosis.passed).toBe(false);
    expect(diagnosis.detectedReps).toBe(0);
    expect(diagnosis.reason).toContain("Rep-avvikelse");
  });
});
