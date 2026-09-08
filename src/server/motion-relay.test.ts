import { beforeEach, describe, expect, it } from "vitest";

import type { MotionSensorFrame } from "@/lib/motion-remote";
import {
  clearMotionRelaySessions,
  createRelaySession,
  getLatestRelayFrame,
  getRelaySignals,
  postRelayFrame,
  postRelaySignal,
} from "./motion-relay";

describe("Motion Remote Sensor Relay (Fas F)", () => {
  beforeEach(() => {
    clearMotionRelaySessions();
  });

  it("creates and retrieves a relay session", () => {
    const session = createRelaySession("PAIR01");
    expect(session.pairingCode).toBe("PAIR01");
    expect(session.connected).toBe(false);
  });

  it("stores and retrieves the latest sensor frame", () => {
    createRelaySession("PAIR01");

    const sampleFrame: MotionSensorFrame = {
      version: 1,
      kind: "motion-sensor-frame",
      sessionId: "PAIR01",
      frameIndex: 1,
      clientTimestampMs: 5000,
      fps: 30,
      landmarks: null,
    };

    postRelayFrame("PAIR01", sampleFrame);
    const retrieved = getLatestRelayFrame("PAIR01");
    expect(retrieved).toEqual(expect.objectContaining(sampleFrame));
    expect(typeof retrieved?.serverTimestampMs).toBe("number");
  });

  it("exchanges WebRTC signaling messages between peers", () => {
    createRelaySession("PAIR01");

    postRelaySignal("PAIR01", { from: "host", type: "offer", sdp: "dummy-offer" });
    const signalsForClient = getRelaySignals("PAIR01", "client");
    expect(signalsForClient).toHaveLength(1);
    expect(signalsForClient[0].sdp).toBe("dummy-offer");

    // Reading signals for client should drain them
    const drained = getRelaySignals("PAIR01", "client");
    expect(drained).toHaveLength(0);
  });
});
