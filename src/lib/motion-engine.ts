export const MOTION_RECORDING_VERSION = 1 as const;
export const MOTION_BASELINE_PROTOCOL_VERSION = "guided-living-room-v2" as const;
export const MOTION_WORKER_MAX_RESTARTS = 3;

export interface MotionBaselinePhase {
  id: "neutral" | "reach" | "squat-front" | "squat-angle" | "lunge-front" | "game-motion";
  startsAtMs: number;
  endsAtMs: number;
  cameraView: "framifrån" | "snett 45°";
  title: string;
  instruction: string;
}

export const MOTION_BASELINE_PROTOCOL: readonly MotionBaselinePhase[] = [
  {
    id: "neutral",
    startsAtMs: 0,
    endsAtMs: 20_000,
    cameraView: "framifrån",
    title: "Stå neutralt",
    instruction: "Håll hela kroppen i bild, med armarna längs sidorna.",
  },
  {
    id: "reach",
    startsAtMs: 20_000,
    endsAtMs: 50_000,
    cameraView: "framifrån",
    title: "Räck och slå",
    instruction: "Räck upp, ut åt båda sidorna och gör lugna slag mot kameran.",
  },
  {
    id: "squat-front",
    startsAtMs: 50_000,
    endsAtMs: 80_000,
    cameraView: "framifrån",
    title: "Knäböj framifrån",
    instruction: "Gör lugna knäböj. Den här vinkeln visar höger–vänster-symmetri.",
  },
  {
    id: "squat-angle",
    startsAtMs: 80_000,
    endsAtMs: 110_000,
    cameraView: "snett 45°",
    title: "Knäböj snett mot kameran",
    instruction: "Vrid kroppen ungefär 45° och sära lite på fötterna så båda benen förblir synliga.",
  },
  {
    id: "lunge-front",
    startsAtMs: 110_000,
    endsAtMs: 150_000,
    cameraView: "framifrån",
    title: "Utfall och sidosteg",
    instruction: "Vänd framåt. Gör växelvisa bakåtutfall och lugna sidosteg utan att lämna bilden.",
  },
  {
    id: "game-motion",
    startsAtMs: 150_000,
    endsAtMs: 180_000,
    cameraView: "framifrån",
    title: "Ducka och slå",
    instruction: "Vänd tillbaka. Växla mellan duckningar, sidosteg och snabba slag.",
  },
] as const;

export function motionBaselinePhase(elapsedMs: number): MotionBaselinePhase {
  const phase = MOTION_BASELINE_PROTOCOL.find(
    (candidate) => elapsedMs >= candidate.startsAtMs && elapsedMs < candidate.endsAtMs,
  );
  return phase ?? MOTION_BASELINE_PROTOCOL[MOTION_BASELINE_PROTOCOL.length - 1];
}

export const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
] as const;

export interface MotionLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number | null;
}

export interface MotionStabilizationDiagnostics {
  heldLowConfidence: number;
  limitedOutliers: number;
}

export interface MotionPoseSnapshot {
  capturedAtMs: number;
  bufferWaitMs?: number;
  inferenceMs: number;
  preparationMs?: number;
  landmarks: MotionLandmark[];
  stabilization?: MotionStabilizationDiagnostics;
  timestampMs: number;
}

export interface MotionRecordedFrame {
  offsetMs: number;
  inferenceMs: number;
  landmarks: MotionLandmark[];
}

export interface MotionRecording {
  version: typeof MOTION_RECORDING_VERSION;
  createdAt: string;
  durationMs: number;
  frameCount: number;
  source: "mediapipe-pose-landmarker-lite";
  containsRawVideo: false;
  frames: MotionRecordedFrame[];
}

export interface MotionMetricSummary {
  p50: number | null;
  p95: number | null;
}

export interface MotionFrameSchedulerState {
  lastObservedVideoTime: number;
  bufferedTimestampMs: number | null;
  bufferedCapturedAtMs: number | null;
}

export interface MotionFrameSchedulerDecision {
  state: MotionFrameSchedulerState;
  capturedFrames: number;
  droppedFrames: number;
  submitTimestampMs: number | null;
  submitCapturedAtMs: number | null;
}

export interface MotionPerformanceProfileReport {
  version: 2;
  kind: "motion-performance-profile";
  protocol: "quick-30s-v2" | "gate-b-10m-v1";
  createdAt: string;
  durationMs: number;
  requestedDurationMs: number;
  requestedResolution: string;
  actualResolution: string;
  delegate: "GPU" | "CPU" | "unknown";
  containsRawVideo: false;
  counts: {
    captures: number;
    poses: number;
    renders: number;
    droppedFrames: number;
    workerRestarts: number;
  };
  summary: {
    captureFpsAverage: number;
    poseHzAverage: number;
    renderFpsAverage: number;
    inferenceP50: number | null;
    inferenceP95: number | null;
    bufferWaitP50: number | null;
    bufferWaitP95: number | null;
    preparationP50: number | null;
    preparationP95: number | null;
    overheadP50: number | null;
    overheadP95: number | null;
    posePipelineP50: number | null;
    posePipelineP95: number | null;
    firstRenderP50: number | null;
    firstRenderP95: number | null;
  };
  checks: {
    completedRequestedDuration: boolean;
    poseAtLeast20Hz: boolean;
    inferenceP95AtMost60Ms: boolean;
    renderAtLeast55Fps: boolean;
    firstRenderP95AtMost120Ms: boolean;
    noWorkerRestarts: boolean;
  };
}

export interface MotionColdStartStats {
  attempts: number;
  successes: number;
}

export interface MotionBaselineSample {
  offsetMs: number;
  captureFps: number;
  poseHz: number;
  renderFps: number;
  inferenceP50: number | null;
  inferenceP95: number | null;
  posePipelineP50: number | null;
  posePipelineP95: number | null;
  firstRenderP50: number | null;
  firstRenderP95: number | null;
  droppedFrames: number;
  fullBodyVisible: boolean;
  luminance: number | null;
  processedLandmarks: number;
  heldLowConfidence: number;
  limitedOutliers: number;
}

export interface MotionBaselineReport {
  version: 1;
  protocol: typeof MOTION_BASELINE_PROTOCOL_VERSION;
  createdAt: string;
  requestedResolution: string;
  actualResolution: string;
  delegate: "GPU" | "CPU" | "unknown";
  durationMs: number;
  sampleCount: number;
  containsRawVideo: false;
  summary: {
    captureFpsAverage: number;
    captureFpsMinimum: number;
    poseHzAverage: number;
    renderFpsAverage: number;
    inferenceP95: number | null;
    posePipelineP95: number | null;
    firstRenderP95: number | null;
    droppedFrames: number;
    fullBodyVisiblePercent: number;
    luminanceAverage: number | null;
    heldLowConfidencePercent: number;
    limitedOutlierPercent: number;
  };
  checks: {
    captureNear30Fps: boolean;
    renderNear60Fps: boolean;
    poseAtLeast20Hz: boolean;
    bodyVisibleAtLeast90Percent: boolean;
  };
  samples: MotionBaselineSample[];
}

export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

export function summarizeMotionMetrics(values: readonly number[]): MotionMetricSummary {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

/** Keeps one fresh camera frame buffered so inference can restart without waiting for a new frame. */
export function scheduleMotionVideoFrame(
  state: MotionFrameSchedulerState,
  videoTimeSeconds: number,
  inferencePending: boolean,
  observedAtMs: number,
): MotionFrameSchedulerDecision {
  let bufferedTimestampMs = state.bufferedTimestampMs;
  let bufferedCapturedAtMs = state.bufferedCapturedAtMs;
  let capturedFrames = 0;
  let droppedFrames = 0;
  const isNewFrame = videoTimeSeconds !== state.lastObservedVideoTime;

  if (isNewFrame) {
    capturedFrames = 1;
    if (bufferedTimestampMs !== null) droppedFrames = 1;
    bufferedTimestampMs = videoTimeSeconds * 1_000;
    bufferedCapturedAtMs = observedAtMs;
  }

  const submitTimestampMs = !inferencePending ? bufferedTimestampMs : null;
  const submitCapturedAtMs = !inferencePending ? bufferedCapturedAtMs : null;
  if (submitTimestampMs !== null) {
    bufferedTimestampMs = null;
    bufferedCapturedAtMs = null;
  }

  return {
    state: {
      lastObservedVideoTime: isNewFrame ? videoTimeSeconds : state.lastObservedVideoTime,
      bufferedTimestampMs,
      bufferedCapturedAtMs,
    },
    capturedFrames,
    droppedFrames,
    submitTimestampMs,
    submitCapturedAtMs,
  };
}

export function buildMotionPerformanceProfile(input: {
  protocol: MotionPerformanceProfileReport["protocol"];
  createdAt: string;
  durationMs: number;
  requestedDurationMs: number;
  requestedResolution: string;
  actualResolution: string;
  delegate: "GPU" | "CPU" | "unknown";
  captures: number;
  poses: number;
  renders: number;
  droppedFrames: number;
  workerRestarts: number;
  inferenceSamples: readonly number[];
  bufferWaitSamples: readonly number[];
  preparationSamples: readonly number[];
  overheadSamples: readonly number[];
  pipelineSamples: readonly number[];
  firstRenderSamples: readonly number[];
}): MotionPerformanceProfileReport {
  const durationSeconds = Math.max(0.001, input.durationMs / 1_000);
  const metrics = (values: readonly number[]) => {
    const summary = summarizeMotionMetrics(values);
    return {
      p50: summary.p50 === null ? null : roundedMetric(summary.p50),
      p95: summary.p95 === null ? null : roundedMetric(summary.p95),
    };
  };
  const inference = metrics(input.inferenceSamples);
  const bufferWait = metrics(input.bufferWaitSamples);
  const preparation = metrics(input.preparationSamples);
  const overhead = metrics(input.overheadSamples);
  const pipeline = metrics(input.pipelineSamples);
  const firstRender = metrics(input.firstRenderSamples);
  return {
    version: 2,
    kind: "motion-performance-profile",
    protocol: input.protocol,
    createdAt: input.createdAt,
    durationMs: roundedMetric(input.durationMs),
    requestedDurationMs: input.requestedDurationMs,
    requestedResolution: input.requestedResolution,
    actualResolution: input.actualResolution,
    delegate: input.delegate,
    containsRawVideo: false,
    counts: {
      captures: input.captures,
      poses: input.poses,
      renders: input.renders,
      droppedFrames: input.droppedFrames,
      workerRestarts: input.workerRestarts,
    },
    summary: {
      captureFpsAverage: roundedMetric(input.captures / durationSeconds),
      poseHzAverage: roundedMetric(input.poses / durationSeconds),
      renderFpsAverage: roundedMetric(input.renders / durationSeconds),
      inferenceP50: inference.p50,
      inferenceP95: inference.p95,
      bufferWaitP50: bufferWait.p50,
      bufferWaitP95: bufferWait.p95,
      preparationP50: preparation.p50,
      preparationP95: preparation.p95,
      overheadP50: overhead.p50,
      overheadP95: overhead.p95,
      posePipelineP50: pipeline.p50,
      posePipelineP95: pipeline.p95,
      firstRenderP50: firstRender.p50,
      firstRenderP95: firstRender.p95,
    },
    checks: {
      completedRequestedDuration: input.durationMs >= input.requestedDurationMs - 500,
      poseAtLeast20Hz: input.poses / durationSeconds >= 20,
      inferenceP95AtMost60Ms: inference.p95 !== null && inference.p95 <= 60,
      renderAtLeast55Fps: input.renders / durationSeconds >= 55,
      firstRenderP95AtMost120Ms: firstRender.p95 !== null && firstRender.p95 <= 120,
      noWorkerRestarts: input.workerRestarts === 0,
    },
  };
}

/** MediaPipe VIDEO mode requires timestamps that remain strictly increasing after WASM conversion. */
export function nextMotionTimestampMs(candidateMs: number, previousMs: number): number {
  const candidate = Number.isFinite(candidateMs) ? Math.max(0, Math.floor(candidateMs)) : 0;
  const previous = Number.isFinite(previousMs) ? Math.floor(previousMs) : -1;
  return Math.max(candidate, previous + 1);
}

export function motionWorkerFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Okänt fel i pose-worker.";
  if (
    message.includes("Packet timestamp mismatch") ||
    message.includes("strictly monotonically increasing")
  ) {
    return "Posemotorns bildklocka tappade synk. Starta kameran igen.";
  }
  return message;
}

export function motionWorkerRetryDelayMs(attempt: number): number {
  const retryIndex = Math.min(2, Math.max(0, Math.floor(attempt) - 1));
  return 400 * 2 ** retryIndex;
}

export function createMotionRecording(
  frames: readonly MotionRecordedFrame[],
  createdAt: string,
): MotionRecording {
  const firstOffsetMs = frames[0]?.offsetMs ?? 0;
  const copiedFrames = frames.map((frame) => ({
    ...frame,
    offsetMs: Math.max(0, frame.offsetMs - firstOffsetMs),
    landmarks: frame.landmarks.map((landmark) => ({ ...landmark })),
  }));
  return {
    version: MOTION_RECORDING_VERSION,
    createdAt,
    durationMs: copiedFrames.at(-1)?.offsetMs ?? 0,
    frameCount: copiedFrames.length,
    source: "mediapipe-pose-landmarker-lite",
    containsRawVideo: false,
    frames: copiedFrames,
  };
}

export function registerColdStartAttempt(current: MotionColdStartStats): MotionColdStartStats {
  return { attempts: current.attempts + 1, successes: current.successes };
}

export function registerColdStartSuccess(current: MotionColdStartStats): MotionColdStartStats {
  return {
    attempts: current.attempts,
    successes: Math.min(current.attempts, current.successes + 1),
  };
}

export function cameraFailureMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Kameran blockerades. Tillåt kamera för den här sidan och försök igen.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "Ingen kamera hittades. Anslut en kamera och försök igen.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Kameran används av en annan app eller kunde inte startas.";
    }
    if (error.name === "OverconstrainedError") {
      return "Kameran stöder inte det valda bildläget. Prova 640 × 480.";
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Kameran eller posemotorn kunde inte startas.";
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function finiteSamples(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null && Number.isFinite(value));
}

export function hasUsableFullBody(landmarks: readonly MotionLandmark[]): boolean {
  const required = [0, 11, 12, 23, 24, 25, 26, 27, 28];
  return required.every((index) => {
    const landmark = landmarks[index];
    return Boolean(
      landmark &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      landmark.x >= 0.01 &&
      landmark.x <= 0.99 &&
      landmark.y >= 0.01 &&
      landmark.y <= 0.99 &&
      (landmark.visibility ?? 1) >= 0.3,
    );
  });
}

export function frameLuminance(pixels: Uint8ClampedArray): number | null {
  if (pixels.length < 4) return null;
  let total = 0;
  let count = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    total += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    count += 1;
  }
  return count === 0 ? null : total / count;
}

export function buildMotionBaselineReport(input: {
  samples: readonly MotionBaselineSample[];
  createdAt: string;
  requestedResolution: string;
  actualResolution: string;
  delegate: "GPU" | "CPU" | "unknown";
  durationMs: number;
}): MotionBaselineReport {
  const samples = input.samples.map((sample) => ({ ...sample }));
  const captureValues = samples.map((sample) => sample.captureFps);
  const poseValues = samples.map((sample) => sample.poseHz);
  const renderValues = samples.map((sample) => sample.renderFps);
  const inferenceP95 = percentile(finiteSamples(samples.map((sample) => sample.inferenceP95)), 0.95);
  const posePipelineP95 = percentile(finiteSamples(samples.map((sample) => sample.posePipelineP95)), 0.95);
  const firstRenderP95 = percentile(finiteSamples(samples.map((sample) => sample.firstRenderP95)), 0.95);
  const luminanceValues = finiteSamples(samples.map((sample) => sample.luminance));
  const processedLandmarks = samples.reduce((total, sample) => total + sample.processedLandmarks, 0);
  const heldLowConfidence = samples.reduce((total, sample) => total + sample.heldLowConfidence, 0);
  const limitedOutliers = samples.reduce((total, sample) => total + sample.limitedOutliers, 0);
  const summary = {
    captureFpsAverage: roundedMetric(average(captureValues)),
    captureFpsMinimum: roundedMetric(captureValues.length ? Math.min(...captureValues) : 0),
    poseHzAverage: roundedMetric(average(poseValues)),
    renderFpsAverage: roundedMetric(average(renderValues)),
    inferenceP95: inferenceP95 === null ? null : roundedMetric(inferenceP95),
    posePipelineP95: posePipelineP95 === null ? null : roundedMetric(posePipelineP95),
    firstRenderP95: firstRenderP95 === null ? null : roundedMetric(firstRenderP95),
    droppedFrames: samples.at(-1)?.droppedFrames ?? 0,
    fullBodyVisiblePercent: roundedMetric(
      samples.length === 0
        ? 0
        : (samples.filter((sample) => sample.fullBodyVisible).length / samples.length) * 100,
    ),
    luminanceAverage: luminanceValues.length ? roundedMetric(average(luminanceValues)) : null,
    heldLowConfidencePercent: roundedMetric(
      processedLandmarks === 0 ? 0 : (heldLowConfidence / processedLandmarks) * 100,
    ),
    limitedOutlierPercent: roundedMetric(
      processedLandmarks === 0 ? 0 : (limitedOutliers / processedLandmarks) * 100,
    ),
  };
  return {
    version: 1,
    protocol: MOTION_BASELINE_PROTOCOL_VERSION,
    createdAt: input.createdAt,
    requestedResolution: input.requestedResolution,
    actualResolution: input.actualResolution,
    delegate: input.delegate,
    durationMs: input.durationMs,
    sampleCount: samples.length,
    containsRawVideo: false,
    summary,
    checks: {
      captureNear30Fps: summary.captureFpsAverage >= 29.5,
      renderNear60Fps: summary.renderFpsAverage >= 55,
      poseAtLeast20Hz: summary.poseHzAverage >= 20,
      bodyVisibleAtLeast90Percent: summary.fullBodyVisiblePercent >= 90,
    },
    samples,
  };
}

function roundedMetric(value: number): number {
  return Math.round(value * 10) / 10;
}
