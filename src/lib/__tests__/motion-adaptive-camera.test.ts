import { describe, expect, it } from "vitest";

import {
  cameraEnvironmentAdvice,
  cameraSetupRomConfidence,
  createSavedCameraSetupProfile,
  evaluateAdaptiveCameraSetup,
  type AdaptiveCameraSample,
} from "../motion-adaptive-camera";

function sample(timestampMs: number): AdaptiveCameraSample {
  return {
    timestampMs,
    poseVisible: true,
    fullBodyVisible: true,
    luminance: 100,
    framing: {
      isOptimal: true,
      issues: [],
      advice: "Bra",
      badgeLabel: "Bra",
      stance: "diagonal",
      placement: "eye-level",
    },
  };
}

describe("adaptive camera setup", () => {
  it("requires stable framing and two calibration reps for a pushup", () => {
    const samples = [sample(0), sample(1_000), sample(2_000), sample(3_000), sample(4_000), sample(5_000)];
    expect(evaluateAdaptiveCameraSetup({ exerciseId: "pushup", samples, calibrationReps: 1, calibrationHoldSeconds: 0 }).ready).toBe(false);
    const ready = evaluateAdaptiveCameraSetup({ exerciseId: "pushup", samples, calibrationReps: 2, calibrationHoldSeconds: 0 });
    expect(ready.ready).toBe(true);
    expect(ready.observationLevel).toBe("rep_counting");
  });

  it("degrades to manual when light, framing or angle is insufficient", () => {
    const dark = sample(0);
    dark.luminance = 30;
    const result = evaluateAdaptiveCameraSetup({ exerciseId: "squat", samples: [dark], calibrationReps: 2, calibrationHoldSeconds: 0 });
    expect(result.observationLevel).toBe("manual");
    expect(result.advice).toMatch(/ljus/i);
  });

  it("restarts the stability clock when framing is interrupted", () => {
    const interrupted = sample(4_000);
    interrupted.poseVisible = false;
    interrupted.framing = null;
    const result = evaluateAdaptiveCameraSetup({
      exerciseId: "pushup",
      samples: [sample(0), sample(1_000), sample(2_000), interrupted, sample(5_000), sample(6_000)],
      calibrationReps: 2,
      calibrationHoldSeconds: 0,
    });
    expect(result.stableSeconds).toBe(1);
    expect(result.ready).toBe(false);
  });

  it("stores only setup metrics for home, outdoor gym and grass", () => {
    const samples = [sample(0), sample(5_000)];
    const evaluation = evaluateAdaptiveCameraSetup({ exerciseId: "pushup", samples, calibrationReps: 2, calibrationHoldSeconds: 0 });
    for (const environment of ["home", "outdoor_gym", "grass"] as const) {
      const profile = createSavedCameraSetupProfile({
        id: `setup-${environment}`,
        environment,
        exerciseId: "pushup",
        resolution: "1280 × 720",
        evaluation,
        samples,
        calibratedAt: "2026-09-08T10:00:00.000Z",
      });
      expect(profile).toMatchObject({ environment, observationLevel: "rep_counting" });
      expect(profile).not.toHaveProperty("samples");
      expect(profile).not.toHaveProperty("video");
      expect(cameraSetupRomConfidence(profile)).toBe(0.8);
      expect(cameraEnvironmentAdvice(environment).length).toBeGreaterThan(20);
    }
  });
});
