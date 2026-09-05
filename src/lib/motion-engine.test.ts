import { describe, expect, it } from "vitest";

import {
  buildMotionBaselineReport,
  buildMotionPerformanceProfile,
  createMotionRecording,
  frameLuminance,
  hasUsableFullBody,
  motionBaselinePhase,
  motionWorkerFailureMessage,
  motionWorkerRetryDelayMs,
  nextMotionTimestampMs,
  percentile,
  registerColdStartAttempt,
  registerColdStartSuccess,
  scheduleMotionVideoFrame,
  summarizeMotionMetrics,
  type MotionFrameSchedulerState,
} from "./motion-engine";

describe("motion-engine", () => {
  it("buffers the latest camera frame and submits it immediately when inference becomes free", () => {
    let state: MotionFrameSchedulerState = {
      lastObservedVideoTime: -1,
      bufferedTimestampMs: null,
      bufferedCapturedAtMs: null,
    };
    const first = scheduleMotionVideoFrame(state, 1, false, 100);
    expect(first).toMatchObject({ capturedFrames: 1, droppedFrames: 0, submitTimestampMs: 1_000, submitCapturedAtMs: 100 });
    state = first.state;

    const buffered = scheduleMotionVideoFrame(state, 1.033, true, 133);
    expect(buffered).toMatchObject({ capturedFrames: 1, droppedFrames: 0, submitTimestampMs: null });
    state = buffered.state;

    const replaced = scheduleMotionVideoFrame(state, 1.066, true, 166);
    expect(replaced).toMatchObject({ capturedFrames: 1, droppedFrames: 1, submitTimestampMs: null });
    state = replaced.state;

    const released = scheduleMotionVideoFrame(state, 1.066, false, 170);
    expect(released).toMatchObject({ capturedFrames: 0, droppedFrames: 0, submitTimestampMs: 1_066, submitCapturedAtMs: 166 });
    expect(released.state.bufferedTimestampMs).toBeNull();
    expect(released.state.bufferedCapturedAtMs).toBeNull();
  });

  it("builds a frozen exact-window performance profile", () => {
    const report = buildMotionPerformanceProfile({
      protocol: "quick-30s-v2",
      createdAt: "2026-09-05T18:00:00.000Z",
      durationMs: 30_000,
      requestedDurationMs: 30_000,
      requestedResolution: "640 × 480",
      actualResolution: "640 × 480",
      delegate: "GPU",
      captures: 900,
      poses: 630,
      renders: 1_800,
      droppedFrames: 270,
      workerRestarts: 0,
      inferenceSamples: [30, 40, 50],
      bufferWaitSamples: [0, 12, 28],
      preparationSamples: [0.4, 0.5, 0.8],
      overheadSamples: [0.2, 0.3, 0.6],
      pipelineSamples: [31, 41, 51],
      firstRenderSamples: [34, 44, 54],
    });

    expect(report).toMatchObject({
      version: 2,
      kind: "motion-performance-profile",
      protocol: "quick-30s-v2",
      requestedDurationMs: 30_000,
      containsRawVideo: false,
      counts: { captures: 900, poses: 630, renders: 1_800, droppedFrames: 270 },
      summary: {
        captureFpsAverage: 30,
        poseHzAverage: 21,
        renderFpsAverage: 60,
        inferenceP50: 40,
        inferenceP95: 50,
        bufferWaitP50: 12,
        bufferWaitP95: 28,
        preparationP95: 0.8,
        overheadP95: 0.6,
        posePipelineP95: 51,
        firstRenderP95: 54,
      },
      checks: {
        completedRequestedDuration: true,
        poseAtLeast20Hz: true,
        inferenceP95AtMost60Ms: true,
        renderAtLeast55Fps: true,
        firstRenderP95AtMost120Ms: true,
        noWorkerRestarts: true,
      },
    });
  });

  it("keeps MediaPipe video timestamps strictly increasing in integer milliseconds", () => {
    expect(nextMotionTimestampMs(12_623, -1)).toBe(12_623);
    expect(nextMotionTimestampMs(12_623.0004, 12_623)).toBe(12_624);
    expect(nextMotionTimestampMs(5_000, 12_624)).toBe(12_625);
  });

  it("turns MediaPipe timestamp internals into a useful recovery message", () => {
    expect(
      motionWorkerFailureMessage(
        new Error("Packet timestamp mismatch; timestamps are not strictly monotonically increasing"),
      ),
    ).toBe("Posemotorns bildklocka tappade synk. Starta kameran igen.");
    expect(motionWorkerFailureMessage(new Error("GPU unavailable"))).toBe("GPU unavailable");
  });

  it("backs worker recovery off without making the player wait too long", () => {
    expect(motionWorkerRetryDelayMs(1)).toBe(400);
    expect(motionWorkerRetryDelayMs(2)).toBe(800);
    expect(motionWorkerRetryDelayMs(3)).toBe(1_600);
    expect(motionWorkerRetryDelayMs(10)).toBe(1_600);
  });

  it("calculates deterministic nearest-rank percentiles", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([9, 1, 5, 3, 7], 0.5)).toBe(5);
    expect(percentile([9, 1, 5, 3, 7], 0.95)).toBe(9);
    expect(summarizeMotionMetrics([12, 20, 10, 18])).toEqual({ p50: 12, p95: 20 });
  });

  it("creates a replayable landmark-only recording", () => {
    const recording = createMotionRecording(
      [
        {
          offsetMs: 120,
          inferenceMs: 14,
          landmarks: [{ x: 0.5, y: 0.25, z: -0.1, visibility: 0.98 }],
        },
        {
          offsetMs: 160,
          inferenceMs: 13,
          landmarks: [{ x: 0.55, y: 0.3, z: -0.08, visibility: 0.97 }],
        },
      ],
      "2026-09-04T12:00:00.000Z",
    );

    expect(recording.version).toBe(1);
    expect(recording.frameCount).toBe(2);
    expect(recording.durationMs).toBe(40);
    expect(recording.frames.map((frame) => frame.offsetMs)).toEqual([0, 40]);
    expect(recording.containsRawVideo).toBe(false);
    expect(JSON.stringify(recording)).not.toContain("data:image");
  });

  it("tracks cold-start attempts without allowing impossible success counts", () => {
    const attempted = registerColdStartAttempt({ attempts: 0, successes: 0 });
    expect(attempted).toEqual({ attempts: 1, successes: 0 });
    expect(registerColdStartSuccess(attempted)).toEqual({ attempts: 1, successes: 1 });
    expect(registerColdStartSuccess({ attempts: 1, successes: 1 })).toEqual({
      attempts: 1,
      successes: 1,
    });
  });

  it("recognizes usable full-body framing and measures luminance", () => {
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));
    expect(hasUsableFullBody(landmarks)).toBe(true);
    landmarks[28] = { ...landmarks[28], y: 1.04 };
    expect(hasUsableFullBody(landmarks)).toBe(false);
    expect(frameLuminance(new Uint8ClampedArray([255, 255, 255, 255]))).toBeCloseTo(255);
    expect(frameLuminance(new Uint8ClampedArray([0, 0, 0, 255]))).toBe(0);
  });

  it("guides the three-minute baseline through front and side views", () => {
    expect(motionBaselinePhase(0).id).toBe("neutral");
    expect(motionBaselinePhase(19_999).id).toBe("neutral");
    expect(motionBaselinePhase(20_000).id).toBe("reach");
    expect(motionBaselinePhase(90_000)).toMatchObject({
      id: "squat-angle",
      cameraView: "snett 45°",
    });
    expect(motionBaselinePhase(120_000)).toMatchObject({
      id: "lunge-front",
      cameraView: "framifrån",
    });
    expect(motionBaselinePhase(180_000).id).toBe("game-motion");
  });

  it("builds a private, reproducible baseline report", () => {
    const report = buildMotionBaselineReport({
      createdAt: "2026-09-04T12:00:00.000Z",
      requestedResolution: "640 × 480",
      actualResolution: "640 × 480",
      delegate: "GPU",
      durationMs: 180_000,
      samples: [
        {
          offsetMs: 500,
          captureFps: 30,
          poseHz: 28,
          renderFps: 60,
          inferenceP50: 12,
          inferenceP95: 18,
          posePipelineP50: 16,
          posePipelineP95: 23,
          firstRenderP50: 21,
          firstRenderP95: 29,
          droppedFrames: 2,
          fullBodyVisible: true,
          luminance: 92,
          processedLandmarks: 33,
          heldLowConfidence: 1,
          limitedOutliers: 0,
        },
        {
          offsetMs: 1_000,
          captureFps: 29.8,
          poseHz: 27,
          renderFps: 59,
          inferenceP50: 13,
          inferenceP95: 20,
          posePipelineP50: 17,
          posePipelineP95: 25,
          firstRenderP50: 22,
          firstRenderP95: 31,
          droppedFrames: 3,
          fullBodyVisible: true,
          luminance: 88,
          processedLandmarks: 33,
          heldLowConfidence: 0,
          limitedOutliers: 1,
        },
      ],
    });
    expect(report.containsRawVideo).toBe(false);
    expect(report.protocol).toBe("guided-living-room-v2");
    expect(report.summary.captureFpsAverage).toBe(29.9);
    expect(report.summary.firstRenderP95).toBe(31);
    expect(report.summary.droppedFrames).toBe(3);
    expect(report.summary.heldLowConfidencePercent).toBe(1.5);
    expect(report.summary.limitedOutlierPercent).toBe(1.5);
    expect(report.checks).toEqual({
      captureNear30Fps: true,
      renderNear60Fps: true,
      poseAtLeast20Hz: true,
      bodyVisibleAtLeast90Percent: true,
    });
  });
});
