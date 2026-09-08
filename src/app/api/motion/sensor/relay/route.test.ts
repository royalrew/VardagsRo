import { beforeEach, describe, expect, it } from "vitest";

import { clearMotionRelaySessions } from "@/server/motion-relay";
import { GET, POST } from "./route";

describe("Motion Sensor Relay API (/api/motion/sensor/relay)", () => {
  beforeEach(() => {
    clearMotionRelaySessions();
  });

  it("creates a pairing session via POST action=create", async () => {
    const req = new Request("http://localhost/api/motion/sensor/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", pairingCode: "PAIR01" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pairingCode).toBe("PAIR01");
  });

  it("accepts a sensor frame via POST action=frame and retrieves it via GET", async () => {
    // 1. Create
    await POST(
      new Request("http://localhost/api/motion/sensor/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", pairingCode: "PAIR01" }),
      }),
    );

    // 2. Post frame
    const framePayload = {
      action: "frame",
      pairingCode: "PAIR01",
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

    // 3. Get frame
    const getRes = await GET(
      new Request("http://localhost/api/motion/sensor/relay?session=PAIR01&role=host"),
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.latestFrame).toBeDefined();
    expect(getBody.latestFrame.frameIndex).toBe(1);
  });
});
