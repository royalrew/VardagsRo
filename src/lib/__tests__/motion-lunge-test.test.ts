import { describe, expect, it } from "vitest";
import { createLungeTrackerState } from "../motion-exercises";
import { buildLungeTestReport } from "../motion-lunge-test";

describe("Lunge Test Report", () => {
  it("generates a complete calibration report for an initial empty state", () => {
    const tracker = createLungeTrackerState();
    const report = buildLungeTestReport(tracker, "2026-09-11T16:00:00.000Z");

    expect(report.exercise).toBe("lunge");
    expect(report.testVersion).toBe("1.0-calibration");
    expect(report.totalReps).toBe(0);
    expect(report.currentKneeAngle).toBe(180);
    expect(report.guidance.cameraAngle).toContain("snett");
    expect(report.evaluationNotes[0]).toContain("Inga repetitioner registrerades");
  });

  it("calculates accurate summary stats from reps history", () => {
    const tracker = createLungeTrackerState();
    tracker.reps = 2;
    tracker.repsHistory = [
      {
        repNumber: 1,
        leadLeg: "left",
        minKneeAngle: 88,
        lockoutKneeAngle: 165,
        durationMs: 1200,
        depthPassed: true,
        lockoutPassed: true,
      },
      {
        repNumber: 2,
        leadLeg: "right",
        minKneeAngle: 92,
        lockoutKneeAngle: 168,
        durationMs: 1400,
        depthPassed: true,
        lockoutPassed: true,
      },
    ];

    const report = buildLungeTestReport(tracker, "2026-09-11T16:00:00.000Z");
    expect(report.totalReps).toBe(2);
    expect(report.summary.passedRepsCount).toBe(2);
    expect(report.summary.depthSuccessRatePercent).toBe(100);
    expect(report.summary.averageDurationSeconds).toBe(1.3);
    expect(report.summary.averageMinKneeAngle).toBe(90);
    expect(report.leadLegDistribution.left).toBe(1);
    expect(report.leadLegDistribution.right).toBe(1);
    expect(report.evaluationNotes).toContain("Utmärkt djup: över 80% av utfallet nådde under 105° knävinkel.");
  });
});
