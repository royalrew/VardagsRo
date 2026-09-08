import { beforeEach, describe, expect, it } from "vitest";

import type { MotionSensorFrame } from "@/lib/motion-remote";
import {
  clearMotionRelaySessions,
  createRelaySession,
  getLatestRelayFrame,
  getRelaySignals,
  joinRelaySession,
  MAX_MOTION_RELAY_SESSIONS,
  MAX_MOTION_RELAY_SIGNALS_PER_ROLE,
  postRelayFrame,
  postRelaySignal,
} from "./motion-relay";

describe("Motion Remote Sensor Relay (Fas F & Hardening)", () => {
  beforeEach(() => {
    clearMotionRelaySessions();
  });

  it("creates and retrieves a relay session with cryptographic tokens", () => {
    const session = createRelaySession("PAIR01");
    expect(session.pairingCode).toBe("PAIR01");
    expect(session.connected).toBe(false);
    expect(typeof session.hostToken).toBe("string");
    expect(session.hostToken.length).toBeGreaterThanOrEqual(16);
    expect(typeof session.clientToken).toBe("string");
    expect(session.clientToken.length).toBeGreaterThanOrEqual(16);
    expect(session.hostToken).not.toBe(session.clientToken);
  });

  it("allows a client device to join using pairing code and retrieve clientToken", () => {
    const session = createRelaySession("PAIR01");
    const joined = joinRelaySession("PAIR01");

    expect(joined.clientToken).toBe(session.clientToken);
    expect(joined.expiresAtMs).toBe(session.expiresAtMs);

    // Joining nonexistent or expired code throws 404
    expect(() => joinRelaySession("UNKNOWN")).toThrowError();
  });

  it("stores and retrieves the latest sensor frame with token verification", () => {
    const session = createRelaySession("PAIR01");

    const sampleFrame: MotionSensorFrame = {
      version: 1,
      kind: "motion-sensor-frame",
      sessionId: "PAIR01",
      frameIndex: 1,
      clientTimestampMs: 5000,
      fps: 30,
      landmarks: null,
    };

    // Posting frame with invalid token fails
    const badTokenOk = postRelayFrame("PAIR01", sampleFrame, "wrong-client-token");
    expect(badTokenOk).toBe(false);

    // Posting frame with valid clientToken succeeds
    const goodTokenOk = postRelayFrame("PAIR01", sampleFrame, session.clientToken);
    expect(goodTokenOk).toBe(true);

    // Reading frame with invalid host token fails
    const unauthRetrieved = getLatestRelayFrame("PAIR01", "wrong-host-token");
    expect(unauthRetrieved).toBeNull();

    // Reading frame with valid host token succeeds
    const retrieved = getLatestRelayFrame("PAIR01", session.hostToken);
    expect(retrieved).toEqual(expect.objectContaining(sampleFrame));
    expect(typeof retrieved?.serverTimestampMs).toBe("number");
  });

  it("exchanges WebRTC signaling messages between peers with role token verification", () => {
    const session = createRelaySession("PAIR01");

    // Host sends offer with hostToken
    postRelaySignal(
      "PAIR01",
      { from: "host", type: "offer", sdp: "dummy-offer" },
      session.hostToken,
    );

    // Client reads signal with clientToken
    const wrongTokenSignals = getRelaySignals("PAIR01", "client", "wrong-token");
    expect(wrongTokenSignals).toHaveLength(0);

    const signalsForClient = getRelaySignals("PAIR01", "client", session.clientToken);
    expect(signalsForClient).toHaveLength(1);
    expect(signalsForClient[0].sdp).toBe("dummy-offer");

    // Reading signals for client should drain them
    const drained = getRelaySignals("PAIR01", "client", session.clientToken);
    expect(drained).toHaveLength(0);
  });

  it("enforces MAX_MOTION_RELAY_SESSIONS capacity and evicts oldest inactive sessions", () => {
    // Fill up to max capacity
    for (let i = 0; i < MAX_MOTION_RELAY_SESSIONS; i++) {
      const code = `S${i.toString().padStart(5, "0")}`;
      createRelaySession(code, { nowMs: 1000 + i });
    }

    const testNowMs = 1000 + MAX_MOTION_RELAY_SESSIONS + 10;
    createRelaySession("NEWONE", { nowMs: testNowMs });

    // The oldest session S00000 should have been evicted
    expect(() => joinRelaySession("S00000", testNowMs)).toThrow();
    // The newest session exists
    expect(joinRelaySession("NEWONE", testNowMs)).toBeDefined();
  });

  it("enforces MAX_MOTION_RELAY_SIGNALS_PER_ROLE queue bounds", () => {
    const session = createRelaySession("PAIR01");

    for (let i = 0; i < MAX_MOTION_RELAY_SIGNALS_PER_ROLE + 10; i++) {
      postRelaySignal(
        "PAIR01",
        { from: "host", type: "candidate", sdp: `cand-${i}` },
        session.hostToken,
      );
    }

    const signals = getRelaySignals("PAIR01", "client", session.clientToken);
    expect(signals.length).toBe(MAX_MOTION_RELAY_SIGNALS_PER_ROLE);
    expect(signals[signals.length - 1].sdp).toBe(`cand-${MAX_MOTION_RELAY_SIGNALS_PER_ROLE + 9}`);
  });
});
