import type { MotionLandmark } from "./motion-engine";

export interface MotionSensorFrame {
  version: 1;
  kind: "motion-sensor-frame";
  sessionId: string;
  frameIndex: number;
  clientTimestampMs: number;
  serverTimestampMs?: number;
  landmarks: readonly MotionLandmark[] | null;
  fps: number;
  batteryLevel?: number;
  isCharging?: boolean;
}
export interface MotionPairingState {
  pairingCode: string;
  createdAtMs: number;
  expiresAtMs: number;
  connected: boolean;
  clientDeviceName?: string;
  lastPingMs?: number;
  clockOffsetMs: number;
  roundTripTimeMs: number;
}

export interface ClockSyncSample {
  t0: number; // Client send ping
  t1: number; // Server receive ping
  t2: number; // Server send pong
  t3: number; // Client receive pong
}

export interface ClockOffsetResult {
  offsetMs: number;
  rttMs: number;
}

const UNAMBIGUOUS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates an uppercase 6-character code avoiding visually ambiguous letters (0/O, 1/I).
 *
 * @returns 6-character pairing code string.
 */
export function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * UNAMBIGUOUS_CHARS.length);
    code += UNAMBIGUOUS_CHARS[idx];
  }
  return code;
}

/**
 * Creates an active pairing session with a defined TTL.
 *
 * @param code - 6-character pairing code (defaults to newly generated).
 * @param nowMs - Current monotonic or epoch millisecond timestamp.
 * @param ttlMs - Time-to-live in milliseconds (defaults to 10 minutes = 600000ms).
 * @returns Pristine pairing session state.
 */
export function createPairingSession(
  code: string = generatePairingCode(),
  nowMs: number = Date.now(),
  ttlMs: number = 600000,
): MotionPairingState {
  return {
    pairingCode: code.toUpperCase(),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    connected: false,
    clockOffsetMs: 0,
    roundTripTimeMs: 0,
  };
}

/**
 * Validates whether a pairing session is still active and has not expired.
 *
 * @param session - Pairing session to inspect.
 * @param nowMs - Current timestamp in milliseconds.
 * @returns True if session is valid and not expired.
 */
export function isPairingSessionValid(
  session: MotionPairingState,
  nowMs: number = Date.now(),
): boolean {
  return nowMs >= session.createdAtMs && nowMs <= session.expiresAtMs;
}

/**
 * Calculates the Round-Trip Time (RTT) and estimated clock offset between
 * the remote sensor client and receiver host using standard NTP formulation:
 * RTT = (t3 - t0) - (t2 - t1)
 * Offset = ((t1 - t0) + (t2 - t3)) / 2
 *
 * @param sample - T0, T1, T2, T3 timestamps.
 * @returns Offset and RTT in milliseconds.
 */
export function calculateClockOffset(sample: ClockSyncSample): ClockOffsetResult {
  const rttMs = (sample.t3 - sample.t0) - (sample.t2 - sample.t1);
  const offsetMs = ((sample.t1 - sample.t0) + (sample.t2 - sample.t3)) / 2;
  return { offsetMs, rttMs };
}

/**
 * Filters multiple clock synchronization samples and picks the one with the lowest
 * Round-Trip Time (NTP minimum dispersion filter) for maximum accuracy.
 *
 * @param samples - Array of clock sync samples.
 * @returns Best offset and RTT result.
 */
export function filterBestClockOffset(samples: readonly ClockSyncSample[]): ClockOffsetResult {
  if (samples.length === 0) {
    return { offsetMs: 0, rttMs: 0 };
  }

  let best = calculateClockOffset(samples[0]);
  for (let i = 1; i < samples.length; i++) {
    const current = calculateClockOffset(samples[i]);
    if (current.rttMs < best.rttMs) {
      best = current;
    }
  }
  return best;
}

/**
 * Serializes a motion sensor frame payload into a compact JSON string.
 *
 * @param frame - The sensor frame to serialize.
 * @returns JSON string representation.
 */
export function serializeSensorFrame(frame: MotionSensorFrame): string {
  return JSON.stringify(frame);
}

/**
 * Deserializes and validates a raw string into a structured MotionSensorFrame.
 * Returns null if the JSON is malformed or missing the required protocol structure.
 *
 * @param raw - Incoming raw string payload.
 * @returns Validated MotionSensorFrame or null if invalid.
 */
export function deserializeSensorFrame(raw: string): MotionSensorFrame | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MotionSensorFrame>;
    if (
      parsed &&
      parsed.version === 1 &&
      parsed.kind === "motion-sensor-frame" &&
      typeof parsed.sessionId === "string" &&
      typeof parsed.frameIndex === "number" &&
      typeof parsed.clientTimestampMs === "number" &&
      typeof parsed.fps === "number" &&
      (parsed.landmarks === null || Array.isArray(parsed.landmarks))
    ) {
      return parsed as MotionSensorFrame;
    }
  } catch {
    return null;
  }
  return null;
}

export interface ReconnectState {
  attempt: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  currentDelayMs: number;
  isReconnecting: boolean;
}

/**
 * Creates initial exponential backoff state for automatic network reconnection.
 *
 * @param baseDelayMs - Initial delay before first retry in ms (default 1000ms).
 * @param maxDelayMs - Maximum delay ceiling in ms (default 10000ms).
 * @param maxAttempts - Maximum consecutive attempts before stopping (default 10).
 * @returns Pristine ReconnectState.
 */
export function createReconnectState(
  baseDelayMs: number = 1000,
  maxDelayMs: number = 10000,
  maxAttempts: number = 10,
): ReconnectState {
  return {
    attempt: 0,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    currentDelayMs: baseDelayMs,
    isReconnecting: false,
  };
}

export interface NextReconnectDelayResult {
  nextState: ReconnectState;
  delayMs: number;
  shouldRetry: boolean;
}

/**
 * Calculates the next retry delay using exponential backoff with a hard upper bound.
 *
 * @param state - Current reconnection state.
 * @returns Updated state, calculated delay in ms, and whether retry should proceed.
 */
export function computeNextReconnectDelay(state: ReconnectState): NextReconnectDelayResult {
  if (state.attempt >= state.maxAttempts) {
    return {
      nextState: { ...state, isReconnecting: false },
      delayMs: 0,
      shouldRetry: false,
    };
  }
  const nextAttempt = state.attempt + 1;
  const delayMs = Math.min(state.baseDelayMs * Math.pow(2, state.attempt), state.maxDelayMs);
  return {
    nextState: {
      ...state,
      attempt: nextAttempt,
      currentDelayMs: delayMs,
      isReconnecting: true,
    },
    delayMs,
    shouldRetry: true,
  };
}

/**
 * Resets reconnection state back to healthy default after a successful connection.
 *
 * @param state - Current reconnection state.
 * @returns Reset ReconnectState.
 */
export function resetReconnectState(state: ReconnectState): ReconnectState {
  return {
    ...state,
    attempt: 0,
    currentDelayMs: state.baseDelayMs,
    isReconnecting: false,
  };
}

/**
 * Calculates end-to-end transit latency for an incoming sensor frame,
 * accounting for client-server clock offset.
 *
 * @param frame - Incoming sensor frame.
 * @param receivedAtMs - Local timestamp when frame was received (ms).
 * @param clockOffsetMs - Estimated clock offset (client time + offset = server time).
 * @returns Non-negative transit latency in milliseconds.
 */
export function calculateEndToEndLatency(
  frame: MotionSensorFrame,
  receivedAtMs: number,
  clockOffsetMs: number = 0,
): number {
  const adjustedClientTimestamp = frame.clientTimestampMs + clockOffsetMs;
  const transitMs = receivedAtMs - adjustedClientTimestamp;
  return Math.max(0, Math.round(transitMs));
}

export interface LatencySample {
  transitMs: number;
  pipelineMs: number;
  totalMs: number;
}

export interface LatencyStats {
  count: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  jitterMs: number;
  droppedFramesCount: number;
}

/**
 * Continuous diagnostic latency tracker for wireless sensor stream.
 * Records transit, pipeline, and total motion-to-feedback latency,
 * and detects dropped frame gaps based on monotonic frame indices.
 */
export class MotionLatencyTracker {
  private samples: LatencySample[] = [];
  private lastFrameIndex: number | null = null;
  private droppedFramesCount: number = 0;

  constructor(private readonly maxSamples: number = 100) {}

  /**
   * Records a latency sample and checks for frame continuity.
   *
   * @param transitMs - Time from client capture/send to receiver receipt (ms).
   * @param pipelineMs - Time spent processing/inferring on host (ms).
   * @param frameIndex - Optional sequence number from sender.
   */
  public record(transitMs: number, pipelineMs: number, frameIndex?: number): void {
    const totalMs = Math.max(0, transitMs + pipelineMs);
    this.samples.push({ transitMs, pipelineMs, totalMs });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    if (frameIndex !== undefined && this.lastFrameIndex !== null) {
      const gap = frameIndex - this.lastFrameIndex - 1;
      if (gap > 0) {
        this.droppedFramesCount += gap;
      }
    }
    if (frameIndex !== undefined) {
      this.lastFrameIndex = frameIndex;
    }
  }

  /**
   * Computes latency statistics over the rolling sample window.
   *
   * @returns Calculated LatencyStats.
   */
  public getStats(): LatencyStats {
    if (this.samples.length === 0) {
      return {
        count: 0,
        p50Ms: 0,
        p95Ms: 0,
        minMs: 0,
        maxMs: 0,
        avgMs: 0,
        jitterMs: 0,
        droppedFramesCount: this.droppedFramesCount,
      };
    }

    const totals = this.samples.map((s) => s.totalMs).sort((a, b) => a - b);
    const count = totals.length;
    const minMs = totals[0];
    const maxMs = totals[count - 1];
    const sum = totals.reduce((acc, val) => acc + val, 0);
    const avgMs = Math.round((sum / count) * 10) / 10;

    const p50Index = Math.min(count - 1, Math.floor(count * 0.5));
    const p95Index = Math.min(count - 1, Math.floor(count * 0.95));
    const p50Ms = totals[p50Index];
    const p95Ms = totals[p95Index];

    // Compute jitter (mean absolute deviation between consecutive total latencies)
    let jitterSum = 0;
    for (let i = 1; i < this.samples.length; i++) {
      jitterSum += Math.abs(this.samples[i].totalMs - this.samples[i - 1].totalMs);
    }
    const jitterMs = this.samples.length > 1 ? Math.round((jitterSum / (this.samples.length - 1)) * 10) / 10 : 0;

    return {
      count,
      p50Ms,
      p95Ms,
      minMs,
      maxMs,
      avgMs,
      jitterMs,
      droppedFramesCount: this.droppedFramesCount,
    };
  }

  /**
   * Resets all collected samples and counters.
   */
  public reset(): void {
    this.samples = [];
    this.lastFrameIndex = null;
    this.droppedFramesCount = 0;
  }
}

export interface RemoteSensorNoticeInput {
  connected: boolean;
  lastFrameReceivedAtMs: number | null;
  nowMs: number;
  batteryLevel?: number | null;
  fullBodyVisible?: boolean;
  fps?: number;
  latencyMs?: number;
}

export interface RemoteSensorNotice {
  severity: "ok" | "warning" | "error";
  badgeLabel: string;
  message: string;
  recommendedAction: string | null;
}

/**
 * Evaluates the status of the remote iPhone sensor and generates clear TV status
 * indicators and actionable guidance for the user in the living room (Steg 58).
 *
 * @param input - Current telemetry and connectivity signals.
 * @returns RemoteSensorNotice with severity, badge label, message, and recommended action.
 */
export function evaluateRemoteSensorNotice(input: RemoteSensorNoticeInput): RemoteSensorNotice {
  if (!input.connected) {
    return {
      severity: "error",
      badgeLabel: "🔴 Frånkopplad",
      message: "iPhone-sensorn är inte ansluten.",
      recommendedAction: "Öppna sensorsidan på din iPhone och skanna QR-koden.",
    };
  }

  if (input.lastFrameReceivedAtMs !== null && input.nowMs - input.lastFrameReceivedAtMs > 3000) {
    return {
      severity: "error",
      badgeLabel: "🔴 Ingen signal",
      message: "Inga rörelsedata har tagits emot på 3 sekunder.",
      recommendedAction: "Kontrollera att iPhonen är igång och ansluten till samma Wi-Fi.",
    };
  }

  if (input.batteryLevel !== undefined && input.batteryLevel !== null && input.batteryLevel < 0.2) {
    const pct = Math.round(input.batteryLevel * 100);
    return {
      severity: "warning",
      badgeLabel: `⚠️ ${pct}% 🔋`,
      message: `Låg batterinivå på iPhone (${pct}%).`,
      recommendedAction: "Anslut laddare så att passet inte avbryts.",
    };
  }

  if (input.fullBodyVisible === false) {
    return {
      severity: "warning",
      badgeLabel: "⚠️ Helkropp saknas",
      message: "Hela kroppen syns inte i kameran.",
      recommendedAction: "Ställ telefonen längre bak så fötter och huvud syns tydligt.",
    };
  }

  if (input.latencyMs !== undefined && input.latencyMs > 150) {
    return {
      severity: "warning",
      badgeLabel: `⚠️ ${Math.round(input.latencyMs)} ms`,
      message: "Hög nätverkslatens uppmätt mellan iPhone och TV.",
      recommendedAction: "Se till att båda enheterna är på samma 5 GHz Wi-Fi.",
    };
  }

  const fpsLabel = input.fps ? `${Math.round(input.fps)} FPS` : "Aktiv";
  return {
    severity: "ok",
    badgeLabel: `🟢 ${fpsLabel}`,
    message: "iPhone-sensor ansluten med god signal.",
    recommendedAction: null,
  };
}

export interface AutoCalibrationState {
  stableFramesCount: number;
  requiredStableFrames: number;
  isCalibrated: boolean;
  progressPercent: number;
  missingJoints: string[];
}

/**
 * Creates initial auto-calibration state for hands-free workout start (Steg 63).
 *
 * @param requiredStableFrames - Consecutive stable full-body frames needed before auto-starting (default 60 ~ 2.0s at 30 FPS).
 * @returns Initial AutoCalibrationState.
 */
export function createAutoCalibrationState(requiredStableFrames: number = 60): AutoCalibrationState {
  return {
    stableFramesCount: 0,
    requiredStableFrames,
    isCalibrated: false,
    progressPercent: 0,
    missingJoints: [],
  };
}

/**
 * Evaluates whether head, hands, hips, knees, and feet are stably visible in frame,
 * accumulating calibration progress until user is ready to begin hands-free (Steg 63).
 *
 * @param landmarks - Current 33 pose landmarks or null.
 * @param previous - Previous AutoCalibrationState.
 * @returns Updated AutoCalibrationState.
 */
export function evaluateAutoCalibration(
  landmarks: readonly MotionLandmark[] | null,
  previous: AutoCalibrationState,
): AutoCalibrationState {
  if (!landmarks || landmarks.length !== 33) {
    return {
      ...previous,
      stableFramesCount: 0,
      isCalibrated: false,
      progressPercent: 0,
      missingJoints: ["helkropp"],
    };
  }

  const missingJoints: string[] = [];

  // Head (0)
  const nose = landmarks[0];
  if (!nose || nose.y < 0.01 || nose.y > 0.99 || (nose.visibility ?? 1) < 0.3) {
    missingJoints.push("huvud");
  }

  // Hips (23, 24)
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  if (
    !leftHip || !rightHip ||
    leftHip.y > 0.99 || rightHip.y > 0.99 ||
    (leftHip.visibility ?? 1) < 0.3 || (rightHip.visibility ?? 1) < 0.3
  ) {
    missingJoints.push("höfter");
  }

  // Knees (25, 26)
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  if (
    !leftKnee || !rightKnee ||
    leftKnee.y > 0.99 || rightKnee.y > 0.99 ||
    (leftKnee.visibility ?? 1) < 0.3 || (rightKnee.visibility ?? 1) < 0.3
  ) {
    missingJoints.push("knän");
  }

  // Feet (27, 28, 31, 32)
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  if (
    !leftAnkle || !rightAnkle ||
    leftAnkle.y > 1.0 || rightAnkle.y > 1.0 ||
    leftAnkle.y < 0.01 || rightAnkle.y < 0.01 ||
    (leftAnkle.visibility ?? 1) < 0.3 || (rightAnkle.visibility ?? 1) < 0.3
  ) {
    missingJoints.push("fötter");
  }

  if (missingJoints.length > 0) {
    return {
      ...previous,
      stableFramesCount: 0,
      isCalibrated: false,
      progressPercent: 0,
      missingJoints,
    };
  }

  const count = previous.stableFramesCount + 1;
  const isCalibrated = count >= previous.requiredStableFrames;
  const progressPercent = Math.min(100, Math.round((count / previous.requiredStableFrames) * 100));

  return {
    ...previous,
    stableFramesCount: count,
    isCalibrated,
    progressPercent,
    missingJoints: [],
  };
}

export type RemoteCommandAction = "skip-rest" | "pause" | "resume" | "reset-tracking";

export interface RemoteCommandPayload {
  action: RemoteCommandAction;
  issuedAtMs: number;
  source: "iphone-sensor-client";
}

export interface RemoteCommandSignal {
  type: "command";
  from: "client";
  payload: RemoteCommandPayload;
}

/**
 * Creates a remote control command signal from the iPhone sensor client to the TV (Steg 67).
 *
 * @param action - Action to trigger on TV/Host ("skip-rest", "pause", "resume", "reset-tracking").
 * @param nowMs - Timestamp in milliseconds.
 * @returns RemoteCommandSignal ready to post via relay.
 */
export function createRemoteCommandSignal(
  action: RemoteCommandAction,
  nowMs: number = Date.now(),
): RemoteCommandSignal {
  return {
    type: "command",
    from: "client",
    payload: {
      action,
      issuedAtMs: nowMs,
      source: "iphone-sensor-client",
    },
  };
}
