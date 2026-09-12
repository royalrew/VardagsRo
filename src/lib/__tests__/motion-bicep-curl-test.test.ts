import { describe, expect, it } from "vitest";
import {
  advanceBicepCurlTracker,
  createBicepCurlTracker,
} from "../motion-library";
import { buildBicepCurlTestReport } from "../motion-bicep-curl-test";
import type { MotionLandmark } from "../motion-engine";
import type { BicepCurlTrackerState } from "../motion-library";

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

function establishStartingExtension(
  landmarks: MotionLandmark[],
  state: BicepCurlTrackerState,
  startedAtMs = 1_000,
): BicepCurlTrackerState {
  state = advanceBicepCurlTracker(landmarks, state, 1, startedAtMs);
  state = advanceBicepCurlTracker(landmarks, state, 1, startedAtMs + 350);
  expect(state.hasEstablishedStartingExtension).toBe(true);
  expect(state.trackingStatus).toBe("ready");
  return state;
}

describe("Bicep Curl Engine & Test Report", () => {
  it("tracks right arm unilateral dumbbell curl accurately", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Extended down
    state = establishStartingExtension(lm, state);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(0);

    // 2. Right arm curling up (elbow angle ~90)
    lm[16] = createMockLandmark(0.62, 0.48, 0); // wrist above elbow level
    state = advanceBicepCurlTracker(lm, state, 1, 1600);
    expect(state.activeArm).toBe("right");

    // 3. Right arm peak contraction (wrist near shoulder, angle < 60)
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1900);
    expect(state.phase).toBe("contracted");
    expect(state.activeArm).toBe("right");

    // 4. Return to bottom extension
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2700);
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
    state = establishStartingExtension(lm, state);

    // 2. Left arm curling up
    lm[15] = createMockLandmark(0.38, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1800);
    state = advanceBicepCurlTracker(lm, state, 1, 1950);
    expect(state.phase).toBe("contracted");
    expect(state.activeArm).toBe("left");

    // 3. Return down
    lm[15] = createMockLandmark(0.38, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2700);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
    expect(state.repsHistory[0].arm).toBe("left");
  });

  it("tracks simultaneous two-arm dumbbell curls as both", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    state = establishStartingExtension(lm, state);

    // Both arms curling up simultaneously
    lm[15] = createMockLandmark(0.38, 0.40, 0);
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1800);
    state = advanceBicepCurlTracker(lm, state, 1, 1950);
    expect(state.phase).toBe("contracted");
    expect(state.activeArm).toBe("both");

    // Both arms extend down
    lm[15] = createMockLandmark(0.38, 0.75, 0);
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2750);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
    expect(state.repsHistory[0].arm).toBe("both");
  });

  it("generates structured JSON test report with arm distribution and summary metrics", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // Perform 1 right curl
    state = establishStartingExtension(lm, state);
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1600);
    state = advanceBicepCurlTracker(lm, state, 1, 1750);
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2400);

    // Perform 1 both curl
    lm[15] = createMockLandmark(0.38, 0.40, 0);
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 3500);
    state = advanceBicepCurlTracker(lm, state, 1, 3650);
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
    expect(report.testVersion).toBe("1.5-approach-guard");
    expect(report.trackingDiagnostics.ready).toBe(true);
    expect(report.evaluationNotes.length).toBeGreaterThan(0);
  });

  it("validates curls in the 85°-105° athletic dumbbell range from front webcam perspective", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Initial bottom position (~155 deg)
    state = establishStartingExtension(lm, state);
    expect(state.phase).toBe("extended");

    // 2. Right curl reaching 92 deg (wrist elevated to chest level)
    lm[16] = createMockLandmark(0.62, 0.44, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1800);
    state = advanceBicepCurlTracker(lm, state, 1, 1950);
    expect(state.phase).toBe("contracted");
    expect(state.activeArm).toBe("right");

    // 3. Lowered back down to 145 deg
    lm[16] = createMockLandmark(0.62, 0.70, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2700);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
    expect(state.repsHistory[0].arm).toBe("right");
    expect(state.repsHistory[0].contractionPassed).toBe(true);
  });

  it("does not count false reps when user is walking into place with arms dangling or swinging naturally", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Walking with arms swinging back and forth, but wrists dangling near hips (y > elbow.y + 0.08)
    // Even if projected elbow angle is bent (~85 deg), wrist is NOT elevated towards shoulder
    lm[13] = createMockLandmark(0.38, 0.55, 0);
    lm[15] = createMockLandmark(0.38, 0.68, 0); // hands down at hip level
    lm[14] = createMockLandmark(0.62, 0.55, 0);
    lm[16] = createMockLandmark(0.62, 0.68, 0);

    state = advanceBicepCurlTracker(lm, state, 1, 1000);
    expect(state.reps).toBe(0);
    expect(state.phase).toBe("extended");

    // Pendulum swing 1
    state = advanceBicepCurlTracker(lm, state, 1, 1500);
    state = advanceBicepCurlTracker(lm, state, 1, 2200);
    expect(state.reps).toBe(0);
    expect(state.phase).toBe("extended");

    // 2. Proximity guard: user stands right up against camera clicking start button
    // Shoulders appear very wide (> 0.38)
    lm[11] = createMockLandmark(0.25, 0.35, 0);
    lm[12] = createMockLandmark(0.75, 0.35, 0); // shoulder width = 0.50
    state = advanceBicepCurlTracker(lm, state, 1, 3000);
    expect(state.reps).toBe(0);
    expect(state.phase).toBe("extended");
  });

  it("requires establishing stable bottom extension before starting repetitions", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // User starts tracker while already holding arms bent at 90 deg
    lm[15] = createMockLandmark(0.38, 0.48, 0);
    lm[16] = createMockLandmark(0.62, 0.48, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1000);
    expect(state.reps).toBe(0);
    expect(state.phase).toBe("extended"); // Won't transition to contracted because no starting extension

    // Now user lowers dumbbells to sides (establishing bottom position)
    lm[15] = createMockLandmark(0.38, 0.75, 0);
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2000);
    state = advanceBicepCurlTracker(lm, state, 1, 2350);
    expect(state.hasEstablishedStartingExtension).toBe(true);

    // Now performs a real curl: elevates wrist to chest level
    lm[16] = createMockLandmark(0.62, 0.40, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2800);
    state = advanceBicepCurlTracker(lm, state, 1, 2950);
    expect(state.phase).toBe("contracted");

    // Lowers back down
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 3700);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
  });

  it("counts a clear curl at the forgiving detection threshold but reports incomplete top contraction", () => {
    let state = establishStartingExtension(createBaseBodyLandmarks(), createBicepCurlTracker());
    const lm = createBaseBodyLandmarks();

    // Depth noise leaves the right elbow near 109°, while the wrist still
    // clearly passes above the elbow: detectable, but short of the 106° quality target.
    lm[12] = createMockLandmark(0.6, 0.35, -0.2);
    lm[16] = createMockLandmark(0.62, 0.5, 0.1);
    state = advanceBicepCurlTracker(lm, state, 1, 1_800);
    state = advanceBicepCurlTracker(lm, state, 1, 1_950);
    expect(state.phase).toBe("contracted");

    lm[12] = createMockLandmark(0.6, 0.35, 0);
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2_700);
    expect(state.reps).toBe(1);
    expect(state.repsHistory[0].contractionPassed).toBe(false);
  });

  it("counts the return when depth noise underestimates the bottom angle but the wrist is back down", () => {
    const lm = createBaseBodyLandmarks();
    let state = establishStartingExtension(lm, createBicepCurlTracker());

    lm[16] = createMockLandmark(0.62, 0.4, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_700);
    state = advanceBicepCurlTracker(lm, state, 1, 1_850);
    expect(state.phase).toBe("contracted");

    // The wrist has visibly returned below the elbow, while noisy depth keeps
    // the calculated 3D elbow angle near 111° instead of the true extension.
    lm[16] = createMockLandmark(0.62, 0.7, -0.4);
    state = advanceBicepCurlTracker(lm, state, 1, 2_600);
    expect(state.rightAngle).toBeLessThan(130);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
  });

  it("pauses a partial curl across a brief unreliable landmark frame without inventing a rep", () => {
    const lm = createBaseBodyLandmarks();
    let state = establishStartingExtension(lm, createBicepCurlTracker());

    lm[16] = createMockLandmark(0.62, 0.48, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_700);
    expect(state.phase).toBe("flexing");

    lm[16] = createMockLandmark(0.62, 0.4, 0, 0.15);
    state = advanceBicepCurlTracker(lm, state, 1, 1_850);
    expect(state.trackingStatus).toBe("tracking-lost");
    expect(state.trackingIssue).toBe("landmarks-unreliable");

    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2_600);
    expect(state.reps).toBe(0);
    expect(state.hasEstablishedStartingExtension).toBe(true);
    expect(state.trackingStatus).toBe("ready");
    expect(state.rejectedFrameCount).toBe(1);
    const diagnostics = buildBicepCurlTestReport(state).trackingDiagnostics;
    expect(diagnostics.lastIssue).toBe("landmarks-unreliable");
    expect(diagnostics.rejectedFrameReasons["landmarks-unreliable"]).toBe(1);
  });

  it("abandons a partial rep after sustained landmark loss but keeps calibration", () => {
    const lm = createBaseBodyLandmarks();
    let state = establishStartingExtension(lm, createBicepCurlTracker());

    lm[16] = createMockLandmark(0.62, 0.48, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_600);
    expect(state.phase).toBe("flexing");

    lm[16] = createMockLandmark(0.62, 0.4, 0, 0.15);
    state = advanceBicepCurlTracker(lm, state, 1, 1_700);
    state = advanceBicepCurlTracker(lm, state, 1, 2_650);

    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2_800);

    expect(state.reps).toBe(0);
    expect(state.phase).toBe("extended");
    expect(state.hasEstablishedStartingExtension).toBe(true);
    expect(state.trackingStatus).toBe("ready");
  });

  it("keeps calibration across a brief framing spike and counts the next curl", () => {
    const lm = createBaseBodyLandmarks();
    let state = establishStartingExtension(lm, createBicepCurlTracker());

    // A single scale spike used to erase the approved bottom calibration.
    lm[11] = createMockLandmark(0.28, 0.3, 0);
    lm[12] = createMockLandmark(0.72, 0.3, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_500);
    expect(state.trackingStatus).toBe("tracking-lost");
    expect(state.trackingIssue).toBe("too-close");
    expect(state.hasEstablishedStartingExtension).toBe(true);

    const recovered = createBaseBodyLandmarks();
    state = advanceBicepCurlTracker(recovered, state, 1, 1_600);
    expect(state.trackingStatus).toBe("ready");

    recovered[16] = createMockLandmark(0.62, 0.4, 0);
    state = advanceBicepCurlTracker(recovered, state, 1, 1_900);
    state = advanceBicepCurlTracker(recovered, state, 1, 2_050);
    expect(state.phase).toBe("contracted");

    recovered[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(recovered, state, 1, 2_750);
    expect(state.reps).toBe(1);
  });

  it("does not turn whole-body translation into a repetition", () => {
    const lm = createBaseBodyLandmarks();
    let state = establishStartingExtension(lm, createBicepCurlTracker());

    // Translate the whole body substantially while preserving all joint-relative positions.
    for (const index of [11, 12, 13, 14, 15, 16]) {
      lm[index] = { ...lm[index], x: lm[index].x + 0.14, y: lm[index].y - 0.1 };
    }
    state = advanceBicepCurlTracker(lm, state, 1, 1_800);
    state = advanceBicepCurlTracker(lm, state, 1, 2_000);

    expect(state.reps).toBe(0);
    expect(state.phase).toBe("extended");
    expect(state.trackingStatus).toBe("ready");
  });

  it("cancels a partial rep when the person walks toward the camera", () => {
    const lm = createBaseBodyLandmarks();
    let state = establishStartingExtension(lm, createBicepCurlTracker());

    // The shoulders grow by 50% but are still inside the absolute camera limits.
    // This is a distance change, not a curl.
    lm[11] = createMockLandmark(0.35, 0.35, 0);
    lm[12] = createMockLandmark(0.65, 0.35, 0);
    lm[15] = createMockLandmark(0.30, 0.48, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_800);

    expect(state.reps).toBe(0);
    expect(state.phase).toBe("extended");
    expect(state.trackingStatus).toBe("tracking-lost");
    expect(state.trackingIssue).toBe("body-moved");
    expect(state.hasEstablishedStartingExtension).toBe(false);

    // It can establish a new baseline at the new distance instead of locking up.
    lm[13] = createMockLandmark(0.33, 0.55, 0);
    lm[15] = createMockLandmark(0.33, 0.75, 0);
    lm[14] = createMockLandmark(0.67, 0.55, 0);
    lm[16] = createMockLandmark(0.67, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2_000);
    state = advanceBicepCurlTracker(lm, state, 1, 2_350);
    expect(state.hasEstablishedStartingExtension).toBe(true);
    expect(state.trackingStatus).toBe("ready");
  });

  it("rejects a close-camera angle glitch when the wrist never clears the elbow", () => {
    const lm = createBaseBodyLandmarks();
    lm[15] = createMockLandmark(0.38, 0.67, 0);
    lm[16] = createMockLandmark(0.62, 0.67, 0);
    let state = establishStartingExtension(lm, createBicepCurlTracker());

    lm[15] = createMockLandmark(0.30, 0.60, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_700);
    lm[15] = createMockLandmark(0.30, 0.56, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_900);
    lm[15] = createMockLandmark(0.38, 0.67, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2_600);

    expect(state.reps).toBe(0);
    expect(state.phase).toBe("extended");
  });

  it("pauses when the person walks too far away without inventing a repetition", () => {
    const lm = createBaseBodyLandmarks();
    let state = establishStartingExtension(lm, createBicepCurlTracker());

    lm[11] = createMockLandmark(0.47, 0.35, 0);
    lm[12] = createMockLandmark(0.53, 0.35, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_800);
    state = advanceBicepCurlTracker(lm, state, 1, 2_800);

    expect(state.reps).toBe(0);
    expect(state.trackingStatus).toBe("tracking-lost");
    expect(state.trackingIssue).toBe("too-far");
    expect(state.hasEstablishedStartingExtension).toBe(true);
  });

  it("does not arm while dumbbells are being lifted into position", () => {
    const lm = createBaseBodyLandmarks();
    let state = createBicepCurlTracker();

    // One bottom frame is not enough to arm the tracker.
    state = advanceBicepCurlTracker(lm, state, 1, 1_000);
    lm[15] = createMockLandmark(0.38, 0.4, 0);
    lm[16] = createMockLandmark(0.62, 0.4, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 1_200);
    state = advanceBicepCurlTracker(lm, state, 1, 1_350);
    lm[15] = createMockLandmark(0.38, 0.75, 0);
    lm[16] = createMockLandmark(0.62, 0.75, 0);
    state = advanceBicepCurlTracker(lm, state, 1, 2_000);

    expect(state.reps).toBe(0);
    expect(state.trackingStatus).toBe("seeking-extension");
  });
});
