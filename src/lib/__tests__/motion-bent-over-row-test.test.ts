import { describe, expect, it } from "vitest";

import {
  advanceBentOverRowTracker,
  createBentOverRowTracker,
} from "../motion-library";
import { buildBentOverRowTestReport } from "../motion-bent-over-row-test";
import type { MotionLandmark } from "../motion-engine";

function landmark(x: number, y: number, visibility = 0.99): MotionLandmark {
  return { x, y, z: 0, visibility };
}

function rowBottom(): MotionLandmark[] {
  const values = Array.from({ length: 33 }, () => landmark(0.5, 0.5));
  values[11] = landmark(0.3, 0.45);
  values[12] = landmark(0.5, 0.45);
  values[13] = landmark(0.32, 0.58);
  values[14] = landmark(0.52, 0.58);
  values[15] = landmark(0.33, 0.72);
  values[16] = landmark(0.53, 0.72);
  values[23] = landmark(0.45, 0.55);
  values[24] = landmark(0.55, 0.55);
  values[25] = landmark(0.45, 0.75);
  values[26] = landmark(0.55, 0.75);
  return values;
}

function rowContracted(): MotionLandmark[] {
  const values = rowBottom();
  values[13] = landmark(0.25, 0.45);
  values[14] = landmark(0.55, 0.45);
  values[15] = landmark(0.34, 0.52);
  values[16] = landmark(0.46, 0.52);
  return values;
}

describe("Bent-over row live test", () => {
  it("counts a controlled bilateral row and builds a detailed report", () => {
    let state = createBentOverRowTracker();
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_000);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_350);
    expect(state.hasEstablishedBottom).toBe(true);

    state = advanceBentOverRowTracker(rowContracted(), state, 1, 1_900);
    state = advanceBentOverRowTracker(rowContracted(), state, 1, 2_050);
    expect(state.phase).toBe("contracted");
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 2_900);
    expect(state.reps).toBe(1);

    const report = buildBentOverRowTestReport(state, "2026-09-11T20:00:00.000Z");
    expect(report.testVersion).toBe("1.2-stable-rearm");
    expect(report.totalReps).toBe(1);
    expect(report.trajectorySampleCount).toBeGreaterThan(0);
    expect(report.trackingDiagnostics.ready).toBe(true);
  });

  it("does not count before a stable extended bottom position", () => {
    let state = createBentOverRowTracker();
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_000);
    state = advanceBentOverRowTracker(rowContracted(), state, 1, 1_150);
    state = advanceBentOverRowTracker(rowContracted(), state, 1, 1_300);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 2_000);
    expect(state.reps).toBe(0);
    expect(state.trackingStatus).toBe("seeking-bottom");
  });

  it("keeps calibration when the apparent shoulder width jitters at a diagonal angle", () => {
    let state = createBentOverRowTracker();
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_000);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_350);

    const moved = rowBottom();
    moved[11] = landmark(0.25, 0.45);
    moved[12] = landmark(0.55, 0.45);
    state = advanceBentOverRowTracker(moved, state, 1, 1_700);

    expect(state.reps).toBe(0);
    expect(state.hasEstablishedBottom).toBe(true);
    expect(state.trackingIssue).toBeUndefined();
    expect(state.trackingStatus).toBe("ready");
  });

  it("tracks the clearest arm when the other arm is partly occluded", () => {
    let state = createBentOverRowTracker();
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_000);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_350);

    const leftClear = rowContracted();
    leftClear[14] = rowBottom()[14];
    leftClear[16] = landmark(0.50, 0.60);
    state = advanceBentOverRowTracker(leftClear, state, 1, 1_900);
    expect(["rowing", "contracted"]).toContain(state.phase);
    state = advanceBentOverRowTracker(leftClear, state, 1, 2_050);

    state = advanceBentOverRowTracker(rowBottom(), state, 1, 2_450);
    expect(state.reps).toBe(1);
  });

  it("aborts an active row when the person walks toward the camera", () => {
    let state = createBentOverRowTracker();
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_000);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_350);
    state = advanceBentOverRowTracker(rowContracted(), state, 1, 1_900);

    const approaching = rowContracted();
    approaching[11] = landmark(0.20, 0.45);
    approaching[12] = landmark(0.60, 0.45);
    state = advanceBentOverRowTracker(approaching, state, 1, 2_050);

    expect(state.reps).toBe(0);
    expect(state.phase).toBe("bottom");
    expect(state.hasEstablishedBottom).toBe(true);
    expect(state.trackingIssue).toBe("distance-changed");
  });

  it("does not double-count an immediate pose jump after a completed row", () => {
    let state = createBentOverRowTracker();
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_000);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 1_350);
    state = advanceBentOverRowTracker(rowContracted(), state, 1, 1_900);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 2_300);
    expect(state.reps).toBe(1);
    expect(state.isArmedForNextRep).toBe(false);

    state = advanceBentOverRowTracker(rowContracted(), state, 1, 2_380);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 2_600);
    expect(state.reps).toBe(1);
    expect(state.phase).toBe("bottom");

    state = advanceBentOverRowTracker(rowBottom(), state, 1, 2_750);
    expect(state.isArmedForNextRep).toBe(true);
    state = advanceBentOverRowTracker(rowContracted(), state, 1, 3_000);
    state = advanceBentOverRowTracker(rowBottom(), state, 1, 3_400);
    expect(state.reps).toBe(2);
  });
});
