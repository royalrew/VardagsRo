import { beforeEach, describe, expect, it } from "vitest";

import { clearMotionRelaySessions } from "@/server/motion-relay";
import { clearRateLimitsForTesting, GET, POST } from "./route";

describe("Motion Sensor Relay API (/api/motion/sensor/relay)", () => {
  beforeEach(() => {
    clearMotionRelaySessions();
    clearRateLimitsForTesting();
  });

  it("creates a pairing session via POST action=create and returns tokens", async () => {
    const req = new Request("http://localhost/api/motion/sensor/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", pairingCode: "PAIR01" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pairingCode).toBe("PAIR01");
    expect(typeof body.hostToken).toBe("string");
    expect(typeof body.clientToken).toBe("string");
    expect(body.hostToken).not.toBe(body.clientToken);
  });

  it("allows joining a session via POST action=join with pairing code", async () => {
    // 1. Host creates session
    const createRes = await POST(
      new Request("http://localhost/api/motion/sensor/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", pairingCode: "PAIR01" }),
      }),
    );
    const created = await createRes.json();

    // 2. Client joins with pairing code
    const joinRes = await POST(
      new Request("http://localhost/api/motion/sensor/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", pairingCode: "PAIR01" }),
      }),
    );
    expect(joinRes.status).toBe(200);
    const joined = await joinRes.json();
    expect(joined.clientToken).toBe(created.clientToken);
  });

  it("accepts a sensor frame via POST action=frame and retrieves it via GET with valid tokens", async () => {
    // 1. Create
    const createRes = await POST(
      new Request("http://localhost/api/motion/sensor/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", pairingCode: "PAIR01" }),
      }),
    );
    const { hostToken, clientToken } = await createRes.json();

    // 2. Attempt post frame without or with wrong token -> 401
    const badFrameRes = await POST(
      new Request("http://localhost/api/motion/sensor/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "frame",
          pairingCode: "PAIR01",
          token: "wrong-token",
          frame: {
            version: 1,
            kind: "motion-sensor-frame",
            sessionId: "PAIR01",
            frameIndex: 1,
            clientTimestampMs: 1234,
            fps: 30,
            landmarks: [{ x: 0.5, y: 0.5, z: 0 }],
          },
        }),
      }),
    );
    expect(badFrameRes.status).toBe(401);

    // 3. Post frame with valid clientToken -> 200
    const framePayload = {
      action: "frame",
      pairingCode: "PAIR01",
      token: clientToken,
      frame: {
        version: 1,
        kind: "motion-sensor-frame",
        sessionId: "PAIR01",
        frameIndex: 1,
        clientTimestampMs: 1234,
        fps: 30,
        landmarks: [{ x: 0.5, y: 0.5, z: 0 }],
      },
    };

    const postFrameRes = await POST(
      new Request("http://localhost/api/motion/sensor/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(framePayload),
      }),
    );
    expect(postFrameRes.status).toBe(200);

    // 4. Attempt get frame without or with wrong token -> 401
    const unauthGetRes = await GET(
      new Request("http://localhost/api/motion/sensor/relay?session=PAIR01&role=host&token=wrong"),
    );
    expect(unauthGetRes.status).toBe(401);

    // 5. Get frame with valid hostToken -> 200
    const getRes = await GET(
      new Request(`http://localhost/api/motion/sensor/relay?session=PAIR01&role=host&token=${hostToken}`),
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.latestFrame).toBeDefined();
    expect(getBody.latestFrame.frameIndex).toBe(1);
  });

  it("rejects oversized request bodies with 413 Payload Too Large", async () => {
    // Large payload > 64 KB
    const giantString = "A".repeat(70 * 1024);
    const req = new Request("http://localhost/api/motion/sensor/relay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(giantString.length),
      },
      body: JSON.stringify({ action: "create", pairingCode: "PAIR01", extra: giantString }),
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("enforces rate limits on session creation and returns 429", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await POST(
        new Request("http://localhost/api/motion/sensor/relay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "192.168.1.50",
          },
          body: JSON.stringify({ action: "create", pairingCode: `PAIR${i.toString().padStart(2, "0")}` }),
        }),
      );
      expect(res.status).toBe(200);
    }

    // 11th request from same IP should be blocked
    const blockedRes = await POST(
      new Request("http://localhost/api/motion/sensor/relay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "192.168.1.50",
        },
        body: JSON.stringify({ action: "create", pairingCode: "PAIR99" }),
      }),
    );
    expect(blockedRes.status).toBe(429);
  });
});
