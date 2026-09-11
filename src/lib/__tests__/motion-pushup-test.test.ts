import { describe, expect, it } from "vitest";
import { createPushupTrackerState, advancePushupTracker } from "../motion-exercises";
import { buildPushupTestReport } from "../motion-pushup-test";
import type { MotionLandmark } from "../motion-engine";

function point(x: number, y: number, visibility = 0.9): MotionLandmark {
  return { x, y, z: 0, visibility };
}

describe("Pushup Calibration Test & Report", () => {
  it("generates a structured report from pushup tracker state", () => {
    let tracker = createPushupTrackerState();

    // Top plank: left side
    const topPlank = Array.from({ length: 33 }, () => point(0.5, 0.5));
    topPlank[11] = point(0.3, 0.4);
    topPlank[13] = point(0.3, 0.6);
    topPlank[15] = point(0.3, 0.8);
    topPlank[23] = point(0.55, 0.5);
    topPlank[27] = point(0.85, 0.8);

    tracker = advancePushupTracker(tracker, topPlank, 1000);

    // Bottom pushup: elbow bent <= 90
    const bottomPushup = Array.from({ length: 33 }, () => point(0.5, 0.5));
    bottomPushup[11] = point(0.3, 0.7);
    bottomPushup[13] = point(0.2, 0.65);
    bottomPushup[15] = point(0.3, 0.8);
    bottomPushup[23] = point(0.55, 0.72);
    bottomPushup[27] = point(0.85, 0.8);

    tracker = advancePushupTracker(tracker, bottomPushup, 1800);

    // Return to top
    tracker = advancePushupTracker(tracker, topPlank, 2600);

    expect(tracker.reps).toBe(1);
    expect(tracker.repsHistory.length).toBe(1);
    expect(tracker.repsHistory[0].minElbowAngle).toBeLessThanOrEqual(95);

    const report = buildPushupTestReport(tracker, "2026-09-10T23:30:00Z");
    expect(report.exercise).toBe("pushup");
    expect(report.totalReps).toBe(1);
    expect(report.reps[0].depthTargetPassed).toBe(true);
    expect(report.summary.passedRepsCount).toBe(1);
    expect(report.guidance.targetBottomElbowDeg).toBe("<= 95°");
  });

  it("handles right-facing orientation when right side has higher visibility", () => {
    let tracker = createPushupTrackerState();

    // Right side: landmarks 12, 14, 16, 24, 28 with high visibility; left side low
    const rightSideTop = Array.from({ length: 33 }, () => point(0.5, 0.5, 0.1));
    rightSideTop[12] = point(0.3, 0.4, 0.95);
    rightSideTop[14] = point(0.3, 0.6, 0.95);
    rightSideTop[16] = point(0.3, 0.8, 0.95);
    rightSideTop[24] = point(0.55, 0.5, 0.95);
    rightSideTop[28] = point(0.85, 0.8, 0.95);

    tracker = advancePushupTracker(tracker, rightSideTop, 1000);
    expect(tracker.side).toBe("right");
    expect(tracker.phase).toBe("plank-top");
  });
});
