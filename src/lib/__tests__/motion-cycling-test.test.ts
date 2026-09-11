import { describe, expect, it } from "vitest";

import { advanceCyclingTracker, createCyclingTracker } from "../motion-cycling";
import { buildCyclingTestReport } from "../motion-cycling-test";
import type { MotionLandmark } from "../motion-engine";

function cyclingPose(kneeAngleDegrees: number): MotionLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  const radians = (kneeAngleDegrees * Math.PI) / 180;
  const setLeg = (hip: number, knee: number, ankle: number, offset: number) => {
    landmarks[hip] = { x: offset, y: 0.3, z: 0, visibility: 1 };
    landmarks[knee] = { x: offset, y: 0.5, z: 0, visibility: 1 };
    landmarks[ankle] = {
      x: offset + Math.sin(radians) * 0.2,
      y: 0.5 - Math.cos(radians) * 0.2,
      z: 0,
      visibility: 1,
    };
  };
  setLeg(23, 25, 27, 0.45);
  setLeg(24, 26, 28, 0.55);
  return landmarks;
}

describe("motion-cycling-test & report", () => {
  it("creates an empty calibration report when no pedal strokes have occurred", () => {
    const state = createCyclingTracker();
    const report = buildCyclingTestReport(state, "2026-09-11T16:00:00.000Z");

    expect(report.exercise).toBe("cycling");
    expect(report.testVersion).toBe("1.0-calibration");
    expect(report.totalRevolutions).toBe(0);
    expect(report.stability.trackingConfidence).toBe("calibrating");
    expect(report.evaluationNotes[0]).toContain("Inga hela pedalvarv");
  });

  it("builds a full calibration report with revolutions history and cadence", () => {
    let state = createCyclingTracker();

    // Rev 1
    state = advanceCyclingTracker(cyclingPose(150), state, 0, 1, 0);
    state = advanceCyclingTracker(cyclingPose(85), state, 0.5, 1, 500);
    state = advanceCyclingTracker(cyclingPose(150), state, 0.5, 1, 1_000);
    expect(state.revolutions).toBe(1);

    // Rev 2
    state = advanceCyclingTracker(cyclingPose(85), state, 0.5, 1, 1_500);
    state = advanceCyclingTracker(cyclingPose(150), state, 0.5, 1, 2_000);
    expect(state.revolutions).toBe(2);

    // Rev 3
    state = advanceCyclingTracker(cyclingPose(85), state, 0.5, 1, 2_500);
    state = advanceCyclingTracker(cyclingPose(150), state, 0.5, 1, 3_000);
    expect(state.revolutions).toBe(3);

    const report = buildCyclingTestReport(state, "2026-09-11T16:00:00.000Z");

    expect(report.totalRevolutions).toBe(3);
    expect(report.revolutions.length).toBe(3);
    expect(report.revolutions[1].rpm).toBe(60);
    expect(report.revolutions[2].rpm).toBe(60);
    expect(report.kneeRangeOfMotion).toBeGreaterThanOrEqual(50);
    expect(report.stability.kneeRangeAdequate).toBe(true);
    expect(report.guidance.cameraAngle).toBe("side (profil)");
    expect(report.evaluationNotes.some((n) => n.includes("3 pedalvarv"))).toBe(true);
  });
});
