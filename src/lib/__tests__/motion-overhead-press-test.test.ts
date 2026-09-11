import { describe, expect, it } from "vitest";
import { createOverheadPressTracker } from "../motion-library";
import { buildOverheadPressTestReport } from "../motion-overhead-press-test";

describe("Overhead Press Test Report", () => {
  it("generates an initial empty report with proper guidance", () => {
    const tracker = createOverheadPressTracker();
    const report = buildOverheadPressTestReport(tracker, "2026-09-11T16:30:00.000Z");

    expect(report.exercise).toBe("overhead-press");
    expect(report.testVersion).toBe("1.0-calibration");
    expect(report.totalReps).toBe(0);
    expect(report.evaluationNotes[0]).toContain("Inga repetitioner");
    expect(report.guidance.cameraAngle).toContain("framifrån");
  });

  it("summarizes single-arm and double-arm press execution", () => {
    const tracker = createOverheadPressTracker();
    tracker.reps = 3;
    tracker.repsHistory = [
      {
        repNumber: 1,
        arm: "right",
        minArmAngle: 82,
        lockoutArmAngle: 168,
        durationMs: 1400,
        lockoutPassed: true,
      },
      {
        repNumber: 2,
        arm: "left",
        minArmAngle: 85,
        lockoutArmAngle: 165,
        durationMs: 1300,
        lockoutPassed: true,
      },
      {
        repNumber: 3,
        arm: "both",
        minArmAngle: 80,
        lockoutArmAngle: 172,
        durationMs: 1500,
        lockoutPassed: true,
      },
    ];

    const report = buildOverheadPressTestReport(tracker, "2026-09-11T16:30:00.000Z");
    expect(report.totalReps).toBe(3);
    expect(report.armDistribution.right).toBe(1);
    expect(report.armDistribution.left).toBe(1);
    expect(report.armDistribution.both).toBe(1);
    expect(report.summary.passedRepsCount).toBe(3);
    expect(report.summary.lockoutSuccessRatePercent).toBe(100);
    expect(report.evaluationNotes).toContain("Stark utlåsning: över 80% av pressarna nådde fullgod sträckning över huvudet (>= 145°).");
  });
});
