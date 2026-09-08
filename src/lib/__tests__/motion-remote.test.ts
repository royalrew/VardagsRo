import { describe, expect, it } from "vitest";

import {
  calculateClockOffset,
  calculateEndToEndLatency,
  computeNextReconnectDelay,
  createAutoCalibrationState,
  createPairingSession,
  createReconnectState,
  createRemoteCommandSignal,
  deserializeSensorFrame,
  evaluateAutoCalibration,
  evaluateRemoteSensorNotice,
  filterBestClockOffset,
  generatePairingCode,
  isPairingSessionValid,
  MotionLatencyTracker,
  resetReconnectState,
  serializeSensorFrame,
  type ClockSyncSample,
  type MotionSensorFrame,
} from "../motion-remote";

describe("Motion Remote Sensor Protocol (Fas F: Steg 53–56)", () => {
  describe("Pairing Session (Steg 55)", () => {
    it("generates a clean 6-character uppercase code without ambiguous letters", () => {
      const code = generatePairingCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(code).not.toMatch(/[01IO]/);
    });

    it("creates a pairing session with a 10-minute validity window by default", () => {
      const now = 100000;
      const session = createPairingSession("KNECT8", now);
      expect(session.pairingCode).toBe("KNECT8");
      expect(session.connected).toBe(false);
      expect(session.expiresAtMs - session.createdAtMs).toBe(600000); // 10 min
      expect(isPairingSessionValid(session, now + 50000)).toBe(true);
      expect(isPairingSessionValid(session, now + 700000)).toBe(false);
    });
  });

  describe("Clock Synchronization (Steg 56)", () => {
    it("accurately computes RTT and clock offset from NTP sample", () => {
      // Client send at t0=1000, Server receives at t1=1015 (clock ahead by 10ms + 5ms transport)
      // Server sends at t2=1016, Client receives at t3=1026
      const sample: ClockSyncSample = {
        t0: 1000,
        t1: 1015,
        t2: 1016,
        t3: 1026,
      };

      const result = calculateClockOffset(sample);
      // RTT = (1026 - 1000) - (1016 - 1015) = 26 - 1 = 25ms
      expect(result.rttMs).toBe(25);
      // Offset = ((1015 - 1000) + (1016 - 1026)) / 2 = (15 + (-10)) / 2 = 2.5ms
      expect(result.offsetMs).toBe(2.5);
    });

    it("selects lowest RTT sample when filtering clock offsets", () => {
      const samples: ClockSyncSample[] = [
        { t0: 100, t1: 130, t2: 132, t3: 200 }, // RTT = 100 - 2 = 98ms
        { t0: 200, t1: 212, t2: 213, t3: 230 }, // RTT = 30 - 1 = 29ms (best)
        { t0: 300, t1: 340, t2: 342, t3: 410 }, // RTT = 110 - 2 = 108ms
      ];

      const best = filterBestClockOffset(samples);
      expect(best.rttMs).toBe(29);
      expect(best.offsetMs).toBeCloseTo(-2.5);
    });
  });

  describe("Sensor Frame Serializer (Steg 53)", () => {
    it("serializes and deserializes sensor landmark frames losslessly", () => {
      const frame: MotionSensorFrame = {
        version: 1,
        kind: "motion-sensor-frame",
        sessionId: "ABC123",
        frameIndex: 42,
        clientTimestampMs: 1234567,
        fps: 29.8,
        batteryLevel: 0.85,
        isCharging: false,
        landmarks: [
          { x: 0.5, y: 0.2, z: -0.1, visibility: 0.99 },
          { x: 0.6, y: 0.4, z: -0.15, visibility: 0.95 },
        ],
      };

      const serialized = serializeSensorFrame(frame);
      expect(typeof serialized).toBe("string");

      const deserialized = deserializeSensorFrame(serialized);
      expect(deserialized).toEqual(frame);
    });

    it("rejects malformed or invalid sensor payloads safely", () => {
      expect(deserializeSensorFrame("")).toBeNull();
      expect(deserializeSensorFrame("{ invalid json }")).toBeNull();
      expect(deserializeSensorFrame(JSON.stringify({ kind: "wrong" }))).toBeNull();
    });
  });

  describe("Automatic Reconnect Manager (Steg 57)", () => {
    it("computes exponential backoff delays up to max limit", () => {
      const state = createReconnectState(1000, 8000, 5);

      const s1 = computeNextReconnectDelay(state);
      expect(s1.shouldRetry).toBe(true);
      expect(s1.delayMs).toBe(1000); // 1000 * 2^0

      const s2 = computeNextReconnectDelay(s1.nextState);
      expect(s2.delayMs).toBe(2000); // 1000 * 2^1

      const s3 = computeNextReconnectDelay(s2.nextState);
      expect(s3.delayMs).toBe(4000); // 1000 * 2^2

      const s4 = computeNextReconnectDelay(s3.nextState);
      expect(s4.delayMs).toBe(8000); // 1000 * 2^3 capped at 8000

      const s5 = computeNextReconnectDelay(s4.nextState);
      expect(s5.delayMs).toBe(8000); // capped

      const s6 = computeNextReconnectDelay(s5.nextState);
      expect(s6.shouldRetry).toBe(false); // exceeded max attempts (5)
    });

    it("resets backoff state cleanly on successful reconnection", () => {
      const state = createReconnectState(1000, 8000, 5);
      const s1 = computeNextReconnectDelay(state);
      const s2 = computeNextReconnectDelay(s1.nextState);
      expect(s2.nextState.attempt).toBe(2);

      const reset = resetReconnectState(s2.nextState);
      expect(reset.attempt).toBe(0);
      expect(reset.isReconnecting).toBe(false);
      expect(reset.currentDelayMs).toBe(1000);
    });
  });

  describe("End-to-End Latency Instrumentation (Steg 59)", () => {
    it("computes transit latency accurately adjusting for clock offset", () => {
      const frame: MotionSensorFrame = {
        version: 1,
        kind: "motion-sensor-frame",
        sessionId: "ABC123",
        frameIndex: 1,
        clientTimestampMs: 5000,
        fps: 30,
        landmarks: [],
      };

      // Server received at 5050ms.
      // Clock offset is +10ms (client clock was 10ms behind server).
      // Effective client timestamp = 5000 + 10 = 5010.
      // Transit = 5050 - 5010 = 40ms.
      const latency = calculateEndToEndLatency(frame, 5050, 10);
      expect(latency).toBe(40);
    });

    it("tracks latency samples and computes p50, p95, min, max, and jitter", () => {
      const tracker = new MotionLatencyTracker(50);
      // Record samples with varying transit and host processing times
      // Sample 1: frameIndex 1, transit 20ms, pipeline 5ms => total 25ms
      tracker.record(20, 5, 1);
      // Sample 2: frameIndex 2, transit 30ms, pipeline 10ms => total 40ms
      tracker.record(30, 10, 2);
      // Sample 3: frameIndex 5 (dropped frames: 3, 4 skipped!), transit 50ms, pipeline 10ms => total 60ms
      tracker.record(50, 10, 5);

      const stats = tracker.getStats();
      expect(stats.count).toBe(3);
      expect(stats.minMs).toBe(25);
      expect(stats.maxMs).toBe(60);
      expect(stats.p50Ms).toBe(40);
      expect(stats.p95Ms).toBe(60);
      expect(stats.droppedFramesCount).toBe(2);
      expect(stats.jitterMs).toBeGreaterThan(0);
    });
  });

  describe("TV Sensor Status & Actionable Notices (Steg 58)", () => {
    it("reports disconnected error if sensor is not connected", () => {
      const notice = evaluateRemoteSensorNotice({
        connected: false,
        lastFrameReceivedAtMs: null,
        nowMs: 10000,
      });

      expect(notice.severity).toBe("error");
      expect(notice.badgeLabel).toContain("Frånkopplad");
      expect(notice.recommendedAction).toContain("QR-koden");
    });

    it("reports stale signal error if no frame arrived in > 3 seconds", () => {
      const notice = evaluateRemoteSensorNotice({
        connected: true,
        lastFrameReceivedAtMs: 5000,
        nowMs: 8500, // 3.5s elapsed
      });

      expect(notice.severity).toBe("error");
      expect(notice.badgeLabel).toContain("Ingen signal");
      expect(notice.recommendedAction).toContain("Wi-Fi");
    });

    it("warns about low iPhone battery (< 20%) with actionable message", () => {
      const notice = evaluateRemoteSensorNotice({
        connected: true,
        lastFrameReceivedAtMs: 9900,
        nowMs: 10000,
        batteryLevel: 0.15,
        fullBodyVisible: true,
        fps: 30,
      });

      expect(notice.severity).toBe("warning");
      expect(notice.badgeLabel).toContain("15%");
      expect(notice.recommendedAction).toContain("Anslut laddare");
    });

    it("warns if full body is not visible with positioning action", () => {
      const notice = evaluateRemoteSensorNotice({
        connected: true,
        lastFrameReceivedAtMs: 9900,
        nowMs: 10000,
        batteryLevel: 0.85,
        fullBodyVisible: false,
        fps: 30,
      });

      expect(notice.severity).toBe("warning");
      expect(notice.badgeLabel).toContain("Helkropp saknas");
      expect(notice.recommendedAction).toContain("Ställ telefonen längre bak");
    });

    it("warns when network latency is high (> 150 ms)", () => {
      const notice = evaluateRemoteSensorNotice({
        connected: true,
        lastFrameReceivedAtMs: 9950,
        nowMs: 10000,
        batteryLevel: 0.85,
        fullBodyVisible: true,
        fps: 30,
        latencyMs: 185,
      });

      expect(notice.severity).toBe("warning");
      expect(notice.badgeLabel).toContain("185 ms");
      expect(notice.recommendedAction).toContain("5 GHz");
    });

    it("returns healthy ok status when sensor is connected, framing is good, and latency is low", () => {
      const notice = evaluateRemoteSensorNotice({
        connected: true,
        lastFrameReceivedAtMs: 9960,
        nowMs: 10000,
        batteryLevel: 0.85,
        fullBodyVisible: true,
        fps: 30,
        latencyMs: 35,
      });

      expect(notice.severity).toBe("ok");
      expect(notice.badgeLabel).toContain("30 FPS");
      expect(notice.recommendedAction).toBeNull();
    });
  });

  describe("Hands-free Auto-Calibration (Fas G: Steg 63)", () => {
    it("accumulates stable frames when head, hands, hips, knees, and feet are visible", () => {
      let state = createAutoCalibrationState(3); // 3 frames for test

      // Frame with full body visible
      const fullBody = Array.from({ length: 33 }, (_, i) => ({
        x: 0.5,
        y: i === 0 ? 0.15 : i === 27 || i === 28 ? 0.9 : 0.5,
        z: 0,
        visibility: 0.95,
      }));

      state = evaluateAutoCalibration(fullBody, state);
      expect(state.stableFramesCount).toBe(1);
      expect(state.isCalibrated).toBe(false);
      expect(state.progressPercent).toBe(33);
      expect(state.missingJoints).toHaveLength(0);

      state = evaluateAutoCalibration(fullBody, state);
      expect(state.stableFramesCount).toBe(2);
      expect(state.progressPercent).toBe(67);

      state = evaluateAutoCalibration(fullBody, state);
      expect(state.stableFramesCount).toBe(3);
      expect(state.isCalibrated).toBe(true);
      expect(state.progressPercent).toBe(100);
    });

    it("resets calibration and lists missing joints when feet are cut off", () => {
      let state = createAutoCalibrationState(5);
      state = { ...state, stableFramesCount: 4, progressPercent: 80 };

      // Missing feet (y > 1.0 or low visibility)
      const cutoff = Array.from({ length: 33 }, (_, i) => ({
        x: 0.5,
        y: i === 27 || i === 28 ? 1.05 : 0.5,
        z: 0,
        visibility: i === 27 || i === 28 ? 0.1 : 0.95,
      }));

      const next = evaluateAutoCalibration(cutoff, state);
      expect(next.stableFramesCount).toBe(0);
      expect(next.isCalibrated).toBe(false);
      expect(next.progressPercent).toBe(0);
      expect(next.missingJoints).toContain("fötter");
    });
  });

  describe("Remote Phone Control Commands (Fas G: Steg 67)", () => {
    it("creates standard skip-rest command signal from iPhone sensor", () => {
      const now = 50000;
      const signal = createRemoteCommandSignal("skip-rest", now);
      expect(signal.type).toBe("command");
      expect(signal.from).toBe("client");
      expect(signal.payload).toEqual({
        action: "skip-rest",
        issuedAtMs: 50000,
        source: "iphone-sensor-client",
      });
    });

    it("creates pause and resume remote command signals", () => {
      const pauseSignal = createRemoteCommandSignal("pause", 1234);
      expect(pauseSignal.payload.action).toBe("pause");

      const resumeSignal = createRemoteCommandSignal("resume", 5678);
      expect(resumeSignal.payload.action).toBe("resume");
    });
  });
});
