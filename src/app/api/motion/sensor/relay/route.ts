import { NextResponse } from "next/server";

import {
  createRelaySession,
  getLatestRelayFrame,
  getRelaySession,
  getRelaySignals,
  postRelayFrame,
  postRelaySignal,
  type MotionRelaySignal,
} from "@/server/motion-relay";
import type { MotionSensorFrame } from "@/lib/motion-remote";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const action = body.action as string;
    const pairingCode = String(body.pairingCode || "").toUpperCase().trim();

    if (!pairingCode) {
      return NextResponse.json({ error: "Missing pairingCode" }, { status: 400 });
    }

    if (action === "create") {
      const session = createRelaySession(pairingCode);
      return NextResponse.json(session);
    }

    if (action === "frame") {
      const frame = body.frame as MotionSensorFrame;
      if (!frame || frame.kind !== "motion-sensor-frame") {
        return NextResponse.json({ error: "Invalid sensor frame" }, { status: 400 });
      }
      const ok = postRelayFrame(pairingCode, frame);
      if (!ok) {
        return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "signal") {
      const signal = body.signal as MotionRelaySignal;
      if (!signal || !signal.from || !signal.type) {
        return NextResponse.json({ error: "Invalid signal" }, { status: 400 });
      }
      const ok = postRelaySignal(pairingCode, signal);
      if (!ok) {
        return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const pairingCode = (searchParams.get("session") || "").toUpperCase().trim();
    const role = searchParams.get("role") as "host" | "client" | null;

    if (!pairingCode) {
      return NextResponse.json({ error: "Missing session parameter" }, { status: 400 });
    }

    const session = getRelaySession(pairingCode);
    if (!session) {
      return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
    }

    const latestFrame = getLatestRelayFrame(pairingCode);
    const signals = role ? getRelaySignals(pairingCode, role) : [];

    return NextResponse.json({
      connected: session.pairing.connected,
      latestFrame,
      signals,
      serverTimeMs: Date.now(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
