import { describe, expect, it } from "vitest";

import {
  advanceLateralRaiseTracker,
  createLateralRaiseTracker,
} from "../motion-library";
import { buildLateralRaiseTestReport } from "../motion-lateral-raise-test";
import type { MotionLandmark } from "../motion-engine";

function landmark(x: number, y: number, visibility = 0.99): MotionLandmark {
  return { x, y, z: 0, visibility };
}

function body(): MotionLandmark[] {
  const values = Array.from({ length: 33 }, () => landmark(0.5, 0.5));
  values[11] = landmark(0.4, 0.3);
  values[12] = landmark(0.6, 0.3);
  values[13] = landmark(0.42, 0.5);
  values[14] = landmark(0.58, 0.5);
  values[15] = landmark(0.43, 0.68);
  values[16] = landmark(0.57, 0.68);
  values[23] = landmark(0.44, 0.68);
  values[24] = landmark(0.56, 0.68);
  return values;
}

describe("Lateral raise live test", () => {
  it("requires a stable bottom, counts a bilateral raise, and builds its report", () => {
    const lm = body();
    let state = createLateralRaiseTracker();
    state = advanceLateralRaiseTracker(lm, state, 1, 1_000);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_350);
    expect(state.hasEstablishedBottom).toBe(true);

    lm[13] = landmark(0.2, 0.3);
    lm[14] = landmark(0.8, 0.3);
    lm[15] = landmark(0.08, 0.3);
    lm[16] = landmark(0.92, 0.3);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_900);
    expect(state.phase).toBe("peak");

    const lowered = body();
    state = advanceLateralRaiseTracker(lowered, state, 1, 2_800);
    expect(state.reps).toBe(1);

    const report = buildLateralRaiseTestReport(state, "2026-09-11T19:00:00.000Z");
    expect(report.testVersion).toBe("1.1-bilateral-sync");
    expect(report.totalReps).toBe(1);
    expect(report.armDistribution.both).toBe(1);
    expect(report.trajectorySampleCount).toBeGreaterThan(0);
    expect(report.trackingDiagnostics.ready).toBe(true);
  });

  it("does not arm while dumbbells are lifted before a stable bottom", () => {
    const lm = body();
    let state = createLateralRaiseTracker();
    state = advanceLateralRaiseTracker(lm, state, 1, 1_000);
    lm[13] = landmark(0.2, 0.3);
    lm[14] = landmark(0.8, 0.3);
    lm[15] = landmark(0.08, 0.3);
    lm[16] = landmark(0.92, 0.3);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_150);
    state = advanceLateralRaiseTracker(body(), state, 1, 2_000);

    expect(state.reps).toBe(0);
    expect(state.trackingStatus).toBe("seeking-bottom");
  });

  it("distinguishes right and left unilateral raises", () => {
    const lm = body();
    let state = createLateralRaiseTracker();
    state = advanceLateralRaiseTracker(lm, state, 1, 1_000);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_350);

    lm[14] = landmark(0.8, 0.3);
    lm[16] = landmark(0.92, 0.3);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_900);
    state = advanceLateralRaiseTracker(body(), state, 1, 2_800);
    expect(state.repsHistory[0].arm).toBe("right");

    const leftRaise = body();
    leftRaise[13] = landmark(0.2, 0.3);
    leftRaise[15] = landmark(0.08, 0.3);
    state = advanceLateralRaiseTracker(leftRaise, state, 1, 3_500);
    state = advanceLateralRaiseTracker(body(), state, 1, 4_400);

    expect(state.reps).toBe(2);
    expect(state.repsHistory[1].arm).toBe("left");
  });

  it("classifies slightly staggered arms as a bilateral raise", () => {
    const lm = body();
    let state = createLateralRaiseTracker();
    state = advanceLateralRaiseTracker(lm, state, 1, 1_000);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_350);

    lm[13] = landmark(0.2, 0.3);
    lm[15] = landmark(0.08, 0.3);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_800);
    expect(state.currentRepArm).toBe("left");

    lm[14] = landmark(0.8, 0.3);
    lm[16] = landmark(0.92, 0.3);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_950);
    expect(state.currentRepArm).toBe("both");

    state = advanceLateralRaiseTracker(body(), state, 1, 2_800);
    expect(state.reps).toBe(1);
    expect(state.repsHistory[0].arm).toBe("both");
  });

  it("cancels calibration when the person walks toward the camera", () => {
    const lm = body();
    let state = createLateralRaiseTracker();
    state = advanceLateralRaiseTracker(lm, state, 1, 1_000);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_350);

    lm[11] = landmark(0.35, 0.3);
    lm[12] = landmark(0.65, 0.3);
    state = advanceLateralRaiseTracker(lm, state, 1, 1_700);

    expect(state.reps).toBe(0);
    expect(state.hasEstablishedBottom).toBe(false);
    expect(state.trackingStatus).toBe("tracking-lost");
    expect(state.trackingIssue).toBe("distance-changed");
  });
});
