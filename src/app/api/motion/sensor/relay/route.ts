import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError } from "@/server/errors";
import {
  createRelaySession,
  getLatestRelayFrame,
  getRelaySession,
  getRelaySignals,
  joinRelaySession,
  postRelayFrame,
  postRelaySignal,
} from "@/server/motion-relay";

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB strict limit

const PAIRING_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    const idx = crypto.randomInt(PAIRING_CHARS.length);
    code += PAIRING_CHARS[idx];
  }
  return code;
}

// In-memory rate limiting
interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}
const rateLimits = new Map<string, RateLimitBucket>();

function checkRateLimit(key: string, maxLimit: number, windowMs: number): boolean {
  const now = Date.now();
  // Occasional sweep of stale buckets
  if (rateLimits.size > 1000) {
    for (const [k, b] of rateLimits) {
      if (now >= b.resetAtMs) rateLimits.delete(k);
    }
  }

  const bucket = rateLimits.get(key);
  if (!bucket || now >= bucket.resetAtMs) {
    rateLimits.set(key, { count: 1, resetAtMs: now + windowMs });
    return true;
  }
  if (bucket.count >= maxLimit) {
    return false;
  }
  bucket.count++;
  return true;
}

export function clearRateLimitsForTesting(): void {
  rateLimits.clear();
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

async function readJsonWithLimit<T>(request: Request, maxBytes: number = MAX_PAYLOAD_BYTES): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Begärans innehåll är för stort (max 64 KB).");
  }

  if (!request.body) {
    throw new AppError(400, "EMPTY_BODY", "Begäran saknar innehåll.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new AppError(413, "PAYLOAD_TOO_LARGE", "Begärans innehåll är för stort (max 64 KB).");
      }
      chunks.push(value);
    }
  }

  const total = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    total.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(total);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError(400, "INVALID_JSON", "Ogiltig JSON.");
  }
}

// Schemas
const landmarkSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite().default(0),
  visibility: z.number().finite().nullable().default(null),
});

const motionSensorFrameSchema = z.object({
  version: z.literal(1),
  kind: z.literal("motion-sensor-frame"),
  sessionId: z.string().max(32),
  frameIndex: z.number().int().nonnegative(),
  clientTimestampMs: z.number().finite(),
  serverTimestampMs: z.number().finite().optional(),
  fps: z.number().finite().min(1).max(240).default(30),
  batteryLevel: z.number().finite().min(0).max(1).optional(),
  isCharging: z.boolean().optional(),
  landmarks: z.array(landmarkSchema).max(33).nullable(),
});

const signalSchema = z.object({
  from: z.enum(["host", "client"]),
  type: z.enum(["offer", "answer", "candidate", "command"]),
  sdp: z.string().max(8192).optional(),
  candidate: z.unknown().optional(),
  payload: z
    .object({
      action: z.enum(["skip-rest", "pause", "resume", "reset-tracking"]),
      issuedAtMs: z.number().finite(),
      source: z.literal("iphone-sensor-client"),
    })
    .optional(),
  timestampMs: z.number().finite().optional(),
});

const createActionSchema = z.object({
  action: z.literal("create"),
  pairingCode: z.string().trim().regex(/^[A-Z0-9]{6}$/i).optional(),
});

const joinActionSchema = z.object({
  action: z.literal("join"),
  pairingCode: z.string().trim().regex(/^[A-Z0-9]{6}$/i),
});

const frameActionSchema = z.object({
  action: z.literal("frame"),
  pairingCode: z.string().trim().regex(/^[A-Z0-9]{6}$/i),
  token: z.string().min(1),
  frame: motionSensorFrameSchema,
});

const signalActionSchema = z.object({
  action: z.literal("signal"),
  pairingCode: z.string().trim().regex(/^[A-Z0-9]{6}$/i),
  token: z.string().min(1),
  signal: signalSchema,
});

const relayMutationSchema = z.discriminatedUnion("action", [
  createActionSchema,
  joinActionSchema,
  frameActionSchema,
  signalActionSchema,
]);

export async function POST(request: Request): Promise<Response> {
  const clientIp = getClientIp(request);

  try {
    const rawBody = await readJsonWithLimit<unknown>(request, MAX_PAYLOAD_BYTES);
    const parsed = relayMutationSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltigt format på begäran.", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const body = parsed.data;

    if (body.action === "create") {
      if (!checkRateLimit(`create:${clientIp}`, 10, 60_000)) {
        return NextResponse.json(
          { error: "För många sessionsskapanden. Försök igen om en minut." },
          { status: 429 },
        );
      }

      const pairingCode = (body.pairingCode || generatePairingCode()).toUpperCase();
      const session = createRelaySession(pairingCode);
      return NextResponse.json(session);
    }

    if (body.action === "join") {
      if (!checkRateLimit(`join:${clientIp}`, 10, 60_000)) {
        return NextResponse.json(
          { error: "För många anslutningsförsök. Försök igen om en minut." },
          { status: 429 },
        );
      }

      const pairingCode = body.pairingCode.toUpperCase();
      try {
        const result = joinRelaySession(pairingCode);
        return NextResponse.json({ ok: true, ...result });
      } catch (err) {
        if (err instanceof AppError && err.status === 404) {
          return NextResponse.json({ error: err.message }, { status: 404 });
        }
        throw err;
      }
    }

    if (body.action === "frame") {
      const pairingCode = body.pairingCode.toUpperCase();
      // Up to 120 FPS frame rate limit per session/token
      if (!checkRateLimit(`frame:${pairingCode}:${body.token}`, 120, 1000)) {
        return NextResponse.json(
          { error: "Bildfrekvensgräns överskriden." },
          { status: 429 },
        );
      }

      const session = getRelaySession(pairingCode);
      if (!session) {
        return NextResponse.json(
          { error: "Sessionen hittades inte eller har gått ut." },
          { status: 404 },
        );
      }

      if (session.clientToken !== body.token) {
        return NextResponse.json(
          { error: "Ogiltigt klienttoken för denna session." },
          { status: 401 },
        );
      }

      const ok = postRelayFrame(pairingCode, body.frame, body.token);
      if (!ok) {
        return NextResponse.json(
          { error: "Sessionen hittades inte eller har gått ut." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "signal") {
      const pairingCode = body.pairingCode.toUpperCase();
      if (!checkRateLimit(`signal:${pairingCode}:${body.token}`, 60, 60_000)) {
        return NextResponse.json(
          { error: "För många signaler skickade." },
          { status: 429 },
        );
      }

      const session = getRelaySession(pairingCode);
      if (!session) {
        return NextResponse.json(
          { error: "Sessionen hittades inte eller har gått ut." },
          { status: 404 },
        );
      }

      const expectedToken =
        body.signal.from === "host" ? session.hostToken : session.clientToken;
      if (expectedToken !== body.token) {
        return NextResponse.json(
          { error: "Ogiltigt token för signalrollen." },
          { status: 401 },
        );
      }

      const ok = postRelaySignal(pairingCode, body.signal, body.token);
      if (!ok) {
        return NextResponse.json(
          { error: "Sessionen hittades inte eller har gått ut." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Okänd åtgärd." }, { status: 400 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internt serverfel." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  const clientIp = getClientIp(request);

  try {
    const { searchParams } = new URL(request.url);
    const pairingCode = (searchParams.get("session") || "").toUpperCase().trim();
    const role = searchParams.get("role") as "host" | "client" | null;
    const token = searchParams.get("token") || "";

    if (!pairingCode || !/^[A-Z0-9]{6}$/i.test(pairingCode)) {
      return NextResponse.json(
        { error: "Giltig 6-teckens sessionskod krävs." },
        { status: 400 },
      );
    }

    if (!role || (role !== "host" && role !== "client")) {
      return NextResponse.json(
        { error: "Roll ('host' eller 'client') måste anges." },
        { status: 400 },
      );
    }

    if (!token) {
      return NextResponse.json(
        { error: "Token krävs för åtkomst till sessionen." },
        { status: 401 },
      );
    }

    // Up to 120 polls per second per session/role
    if (!checkRateLimit(`get:${pairingCode}:${role}:${token}`, 120, 1000)) {
      return NextResponse.json(
        { error: "För många förfrågningar." },
        { status: 429 },
      );
    }

    const session = getRelaySession(pairingCode);
    if (!session) {
      return NextResponse.json(
        { error: "Sessionen hittades inte eller har gått ut." },
        { status: 404 },
      );
    }

    const expectedToken = role === "host" ? session.hostToken : session.clientToken;
    if (expectedToken !== token) {
      return NextResponse.json(
        { error: "Ogiltigt token för denna roll." },
        { status: 401 },
      );
    }

    const latestFrame = role === "host" ? getLatestRelayFrame(pairingCode, token) : null;
    const signals = getRelaySignals(pairingCode, role, token);

    return NextResponse.json({
      connected: session.pairing.connected,
      latestFrame,
      signals,
      serverTimeMs: Date.now(),
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internt serverfel." },
      { status: 500 },
    );
  }
}
