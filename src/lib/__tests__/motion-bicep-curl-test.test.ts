import { describe, expect, it } from "vitest";
import {
  advanceBicepCurlTracker,
  createBicepCurlTracker,
} from "../motion-library";
import { buildBicepCurlTestReport } from "../motion-bicep-curl-test";
import type { MotionLandmark } from "../motion-engine";

function createMockLandmark(x: number, y: number, z = 0, visibility = 0.99): MotionLandmark {
  return { x, y, z, visibility };
}

function createBaseBodyLandmarks(): MotionLandmark[] {
  const lm: MotionLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    lm.push(createMockLandmark(0.5, 0.5, 0));
  }
  // Nose
  lm[0] = createMockLandmark(0.5, 0.2);
  // Left shoulder, elbow, wrist
  lm[11] = createMockLandmark(0.4, 0.35, 0);
  lm[13] = createMockLandmark(0.38, 0.55, 0);
  lm[15] = createMockLandmark(0.38, 0.75, 0); // Extended down
  // Right shoulder, elbow, wrist
  lm[12] = createMockLandmark(0.6, 0.35, 0);
  lm[14] = createMockLandmark(0.62, 0.55, 0);
  lm[16] = createMockLandmark(0.62, 0.75, 0); // Extended down
  // Hips
  lm[23] = createMockLandmark(0.45, 0.65, 0);
  lm[24] = createMockLandmark(0.55, 0.65, 0);
  return lm;
}

describe("Bicep Curl Engine & Test Report", () => {
  it("tracks right arm unilateral dumbbell curl accurately", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Extended down
    state = advanceBicepCurlTracker(lm, state, 1, 1000);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(0);

    // 2. Right arm curling up (elbow angle ~90)
    lm[16] = createMockLandmark(0.62, 0.48, 0); // wrist above elbow level
    state = advanceBicepCurlTracker(lm, state, 1, 1500);
    expect(state.activeArm).toBe("right");

    // 3. Right arm peak contraction (wrist near shoulder, angle < 60)
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2000);
    expect(state.phase).toBe("contracted");
    expect(state.activeArm).toBe("right");

    // 4. Return to bottom extension
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2800);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
    expect(state.repsHistory).toHaveLength(1);
    expect(state.repsHistory[0].arm).toBe("right");
    expect(state.repsHistory[0].contractionPassed).toBe(true);
  });

  it("tracks left arm unilateral dumbbell curl accurately", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Extended down
    state = advanceBicepCurlTracker(lm, state, 1, 1000);

    // 2. Left arm curling up
    lm[15] = createMockLandmark(0.38, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1800);
    expect(state.phase).toBe("contracted");
    expect(state.activeArm).toBe("left");

    // 3. Return down
    lm[15] = createMockLandmark(0.38, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2600);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
    expect(state.repsHistory[0].arm).toBe("left");
  });

  it("tracks simultaneous two-arm dumbbell curls as both", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    state = advanceBicepCurlTracker(lm, state, 1, 1000);

    // Both arms curling up simultaneously
    lm[15] = createMockLandmark(0.38, 0.40, 0);
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1800);
    expect(state.phase).toBe("contracted");
    expect(state.activeArm).toBe("both");

    // Both arms extend down
    lm[15] = createMockLandmark(0.38, 0.75, 0);
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2700);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
    expect(state.repsHistory[0].arm).toBe("both");
  });

  it("generates structured JSON test report with arm distribution and summary metrics", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // Perform 1 right curl
    state = advanceBicepCurlTracker(lm, state, 1, 1000);
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1600);
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2300);

    // Perform 1 both curl
    lm[15] = createMockLandmark(0.38, 0.40, 0);
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 3500);
    lm[15] = createMockLandmark(0.38, 0.75, 0);
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 4500);

    const report = buildBicepCurlTestReport(state, "2026-09-11T19:00:00.000Z");
    expect(report.exercise).toBe("bicep-curl");
    expect(report.totalReps).toBe(2);
    expect(report.armDistribution.right).toBe(1);
    expect(report.armDistribution.both).toBe(1);
    expect(report.summary.contractionSuccessRatePercent).toBe(100);
    expect(report.reps[0].durationSeconds).toBeGreaterThan(0);
    expect(report.evaluationNotes.length).toBeGreaterThan(0);
  });

  it("validates curls in the 85°-105° athletic dumbbell range from front webcam perspective", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Initial bottom position (~155 deg)
    state = advanceBicepCurlTracker(lm, state, 1, 1000);
    expect(state.phase).toBe("extended");

    // 2. Right curl reaching 92 deg (wrist elevated to chest level)
    lm[16] = createMockLandmark(0.62, 0.44, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1800);
    expect(state.phase).toBe("contracted");
    expect(state.activeArm).toBe("right");

    // 3. Lowered back down to 145 deg
    lm[16] = createMockLandmark(0.62, 0.70, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2600);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
    expect(state.repsHistory[0].arm).toBe("right");
    expect(state.repsHistory[0].contractionPassed).toBe(true);
  });
});
