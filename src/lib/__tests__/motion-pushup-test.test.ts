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
    expect(report.guidance.targetBottomElbowDeg).toBe("<= 100°");
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

  it("accurately tracks pushups from FRONTAL view where ankles are obscured behind body", () => {
    let tracker = createPushupTrackerState();

    // Frontal view: shoulders (11/12), elbows (13/14), wrists (15/16) are clearly visible
    // Feet/ankles (27/28) are obscured behind body on the floor (visibility 0.05)
    function frontPushupPose(elbowSpreadX: number, chestY: number): MotionLandmark[] {
      const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5, 0.05));
      // Left arm
      landmarks[11] = point(0.40, chestY, 0.95); // left shoulder
      landmarks[13] = point(0.40 - elbowSpreadX, chestY + 0.10, 0.95); // left elbow
      landmarks[15] = point(0.35, 0.75, 0.95); // left wrist on floor
      // Right arm
      landmarks[12] = point(0.60, chestY, 0.95); // right shoulder
      landmarks[14] = point(0.60 + elbowSpreadX, chestY + 0.10, 0.95); // right elbow
      landmarks[16] = point(0.65, 0.75, 0.95); // right wrist on floor
      return landmarks;
    }

    // Top position: straight arms, chest up at 0.40, elbow close to straight
    const topPose = frontPushupPose(0.04, 0.40);
    // Bottom position: chest lowered to 0.55, elbows flared out (elbow bent ~90°)
    const bottomPose = frontPushupPose(0.18, 0.55);

    // Initial pose
    tracker = advancePushupTracker(tracker, topPose, 1000);
    expect(tracker.phase).toBe("plank-top");

    // Do 3 pushups in front view
    for (let i = 1; i <= 3; i++) {
      tracker = advancePushupTracker(tracker, bottomPose, 1000 + i * 2000);
      expect(tracker.phase).toBe("bottom");
      tracker = advancePushupTracker(tracker, topPose, 1000 + i * 2000 + 1000);
      expect(tracker.reps).toBe(i);
    }

    expect(tracker.reps).toBe(3);
    const report = buildPushupTestReport(tracker);
    expect(report.totalReps).toBe(3);
    expect(report.summary.passedRepsCount).toBe(3);
  });

  it("accurately tracks pushups from DIAGONAL (snett 30°-45°) view with natural depth", () => {
    let tracker = createPushupTrackerState();

    // Snett / diagonal view: right side foreground (facing camera diagonally)
    function diagonalPushupPose(elbowAngleDeg: number): MotionLandmark[] {
      const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5, 0.3));
      const rad = ((180 - elbowAngleDeg) * Math.PI) / 180;
      // Right arm facing camera
      landmarks[12] = point(0.40, 0.40, 0.95); // shoulder
      landmarks[14] = point(0.40, 0.60, 0.95); // elbow
      landmarks[16] = point(0.40 + Math.sin(rad) * 0.2, 0.60 + Math.cos(rad) * 0.2, 0.95); // wrist
      // Hip & ankle visible at angle
      landmarks[24] = point(0.65, 0.45, 0.8);
      landmarks[28] = point(0.85, 0.50, 0.7);
      return landmarks;
    }

    // Top: 160 deg
    tracker = advancePushupTracker(tracker, diagonalPushupPose(160), 1000);
    // Bottom: 88 deg
    tracker = advancePushupTracker(tracker, diagonalPushupPose(88), 2000);
    expect(tracker.phase).toBe("bottom");
    // Return to top: 155 deg
    tracker = advancePushupTracker(tracker, diagonalPushupPose(155), 3000);
    expect(tracker.reps).toBe(1);
  });
});
