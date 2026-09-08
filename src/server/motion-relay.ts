import crypto from "node:crypto";
import { AppError } from "@/server/errors";
import type {
  MotionPairingState,
  MotionSensorFrame,
  RemoteCommandAction,
} from "@/lib/motion-remote";
import { createPairingSession, isPairingSessionValid } from "@/lib/motion-remote";

export interface MotionRelaySignal {
  from: "host" | "client";
  type: "offer" | "answer" | "candidate" | "command";
  sdp?: string;
  candidate?: unknown;
  payload?: {
    action: RemoteCommandAction;
    issuedAtMs: number;
    source: "iphone-sensor-client";
  };
  timestampMs?: number;
}

export interface MotionRelaySessionState {
  ownerUserId?: string;
  hostToken: string;
  clientToken: string;
  pairing: MotionPairingState;
  latestFrame: MotionSensorFrame | null;
  signalsForHost: MotionRelaySignal[];
  signalsForClient: MotionRelaySignal[];
  lastActiveMs: number;
}

export interface MotionRelayCreatedSession extends MotionPairingState {
  hostToken: string;
  clientToken: string;
}

export const MAX_MOTION_RELAY_SESSIONS = 64;
export const MAX_MOTION_RELAY_SESSIONS_PER_USER = 4;
export const MAX_MOTION_RELAY_SIGNALS_PER_ROLE = 64;

const sessions = new Map<string, MotionRelaySessionState>();

function generateSecureToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function pruneExpiredSessions(nowMs: number = Date.now()): void {
  for (const [code, session] of sessions) {
    if (!isPairingSessionValid(session.pairing, nowMs)) {
      sessions.delete(code);
    }
  }
}

function evictOldestSession(): void {
  let oldestCode: string | null = null;
  let oldestActive = Number.POSITIVE_INFINITY;
  for (const [code, session] of sessions) {
    if (session.lastActiveMs < oldestActive) {
      oldestActive = session.lastActiveMs;
      oldestCode = code;
    }
  }
  if (oldestCode) {
    sessions.delete(oldestCode);
  }
}

function evictOldestSessionForUser(ownerUserId: string): void {
  const oldest = [...sessions.entries()]
    .filter(([, session]) => session.ownerUserId === ownerUserId)
    .sort((left, right) => left[1].pairing.createdAtMs - right[1].pairing.createdAtMs)[0];
  if (oldest) {
    sessions.delete(oldest[0]);
  }
}

/**
 * Creates or resets a motion relay session with host and client security tokens.
 *
 * @param pairingCode - 6-character pairing code.
 * @param optionsOrNow - Creation options (ownerUserId, nowMs, tokens) or nowMs timestamp.
 * @returns Initialized pairing state with host and client tokens.
 */
export function createRelaySession(
  pairingCode: string,
  optionsOrNow?:
    | {
        ownerUserId?: string;
        nowMs?: number;
        hostToken?: string;
        clientToken?: string;
      }
    | number,
): MotionRelayCreatedSession {
  const options =
    typeof optionsOrNow === "number"
      ? { nowMs: optionsOrNow }
      : optionsOrNow ?? {};
  const nowMs = options.nowMs ?? Date.now();
  const ownerUserId = options.ownerUserId;
  const cleanCode = pairingCode.toUpperCase().trim();

  pruneExpiredSessions(nowMs);

  const existing = sessions.get(cleanCode);
  if (existing && ownerUserId && existing.ownerUserId && existing.ownerUserId !== ownerUserId) {
    throw new AppError(
      409,
      "MOTION_RELAY_CODE_IN_USE",
      "Parningskoden används redan. Skapa en ny kod.",
    );
  }

  if (ownerUserId) {
    const ownedCount = [...sessions.values()].filter(
      (s) => s.ownerUserId === ownerUserId,
    ).length;
    if (!existing && ownedCount >= MAX_MOTION_RELAY_SESSIONS_PER_USER) {
      evictOldestSessionForUser(ownerUserId);
    }
  }

  if (!existing && sessions.size >= MAX_MOTION_RELAY_SESSIONS) {
    evictOldestSession();
  }

  const hostToken = options.hostToken ?? generateSecureToken();
  const clientToken = options.clientToken ?? generateSecureToken();
  const pairing = createPairingSession(cleanCode, nowMs);

  const state: MotionRelaySessionState = {
    ownerUserId,
    hostToken,
    clientToken,
    pairing,
    latestFrame: null,
    signalsForHost: [],
    signalsForClient: [],
    lastActiveMs: nowMs,
  };

  sessions.set(cleanCode, state);

  return {
    ...pairing,
    hostToken,
    clientToken,
  };
}

/**
 * Allows a client device (e.g. mobile Safari) to join a session using the pairing code
 * and obtain the client security token.
 */
export function joinRelaySession(
  pairingCode: string,
  nowMs: number = Date.now(),
): { clientToken: string; expiresAtMs: number } {
  pruneExpiredSessions(nowMs);
  const cleanCode = pairingCode.toUpperCase().trim();
  const session = sessions.get(cleanCode);

  if (!session || !isPairingSessionValid(session.pairing, nowMs)) {
    throw new AppError(
      404,
      "MOTION_RELAY_NOT_FOUND",
      "Parningssessionen hittades inte eller har gått ut.",
    );
  }

  session.lastActiveMs = nowMs;
  return {
    clientToken: session.clientToken,
    expiresAtMs: session.pairing.expiresAtMs,
  };
}

/**
 * Retrieves an active relay session state by pairing code.
 */
export function getRelaySession(
  pairingCode: string,
  nowMs: number = Date.now(),
): MotionRelaySessionState | null {
  pruneExpiredSessions(nowMs);
  const cleanCode = pairingCode.toUpperCase().trim();
  const session = sessions.get(cleanCode);
  if (!session || !isPairingSessionValid(session.pairing, nowMs)) {
    return null;
  }
  return session;
}

/**
 * Stores the latest sensor landmark frame from the client device.
 * Validates that the provided token matches the session clientToken.
 */
export function postRelayFrame(
  pairingCode: string,
  frame: MotionSensorFrame,
  optionsOrToken?: { token?: string; nowMs?: number } | string,
  fallbackNowMs?: number,
): boolean {
  const token =
    typeof optionsOrToken === "string" ? optionsOrToken : optionsOrToken?.token;
  const nowMs =
    typeof optionsOrToken === "object" && typeof optionsOrToken.nowMs === "number"
      ? optionsOrToken.nowMs
      : fallbackNowMs ?? Date.now();

  pruneExpiredSessions(nowMs);
  const cleanCode = pairingCode.toUpperCase().trim();
  const session = sessions.get(cleanCode);
  if (!session || !isPairingSessionValid(session.pairing, nowMs)) {
    return false;
  }

  if (token && session.clientToken !== token) {
    return false;
  }

  session.latestFrame = {
    ...frame,
    serverTimestampMs: nowMs,
  };
  session.pairing.connected = true;
  session.lastActiveMs = nowMs;
  return true;
}

/**
 * Retrieves the latest sensor frame pushed by the remote client.
 * Validates that the provided token matches the session hostToken.
 */
export function getLatestRelayFrame(
  pairingCode: string,
  optionsOrToken?: { token?: string; nowMs?: number } | string,
  fallbackNowMs?: number,
): MotionSensorFrame | null {
  const token =
    typeof optionsOrToken === "string" ? optionsOrToken : optionsOrToken?.token;
  const nowMs =
    typeof optionsOrToken === "object" && typeof optionsOrToken.nowMs === "number"
      ? optionsOrToken.nowMs
      : fallbackNowMs ?? Date.now();

  pruneExpiredSessions(nowMs);
  const cleanCode = pairingCode.toUpperCase().trim();
  const session = sessions.get(cleanCode);
  if (!session || !isPairingSessionValid(session.pairing, nowMs)) {
    return null;
  }

  if (token && session.hostToken !== token) {
    return null;
  }

  return session.latestFrame;
}

/**
 * Appends a WebRTC signaling or remote command message.
 * Validates that the token matches the sender's role.
 */
export function postRelaySignal(
  pairingCode: string,
  signal: MotionRelaySignal,
  optionsOrToken?: { token?: string; nowMs?: number } | string,
  fallbackNowMs?: number,
): boolean {
  const token =
    typeof optionsOrToken === "string" ? optionsOrToken : optionsOrToken?.token;
  const nowMs =
    typeof optionsOrToken === "object" && typeof optionsOrToken.nowMs === "number"
      ? optionsOrToken.nowMs
      : fallbackNowMs ?? Date.now();

  pruneExpiredSessions(nowMs);
  const cleanCode = pairingCode.toUpperCase().trim();
  const session = sessions.get(cleanCode);
  if (!session || !isPairingSessionValid(session.pairing, nowMs)) {
    return false;
  }

  if (token) {
    const valid =
      signal.from === "host"
        ? session.hostToken === token
        : session.clientToken === token;
    if (!valid) return false;
  }

  const timestamped: MotionRelaySignal = {
    ...signal,
    timestampMs: nowMs,
  };

  if (signal.from === "host") {
    if (session.signalsForClient.length >= MAX_MOTION_RELAY_SIGNALS_PER_ROLE) {
      session.signalsForClient.shift();
    }
    session.signalsForClient.push(timestamped);
  } else {
    if (session.signalsForHost.length >= MAX_MOTION_RELAY_SIGNALS_PER_ROLE) {
      session.signalsForHost.shift();
    }
    session.signalsForHost.push(timestamped);
  }

  session.lastActiveMs = nowMs;
  return true;
}

/**
 * Drains and returns queued signaling messages for a given recipient role (host or client).
 * Validates that the token matches the recipient role.
 */
export function getRelaySignals(
  pairingCode: string,
  forRole: "host" | "client",
  optionsOrToken?: { token?: string; nowMs?: number } | string,
  fallbackNowMs?: number,
): MotionRelaySignal[] {
  const token =
    typeof optionsOrToken === "string" ? optionsOrToken : optionsOrToken?.token;
  const nowMs =
    typeof optionsOrToken === "object" && typeof optionsOrToken.nowMs === "number"
      ? optionsOrToken.nowMs
      : fallbackNowMs ?? Date.now();

  pruneExpiredSessions(nowMs);
  const cleanCode = pairingCode.toUpperCase().trim();
  const session = sessions.get(cleanCode);
  if (!session || !isPairingSessionValid(session.pairing, nowMs)) {
    return [];
  }

  if (token) {
    const valid =
      forRole === "host"
        ? session.hostToken === token
        : session.clientToken === token;
    if (!valid) return [];
  }

  session.lastActiveMs = nowMs;
  if (forRole === "host") {
    const queue = session.signalsForHost;
    session.signalsForHost = [];
    return queue;
  } else {
    const queue = session.signalsForClient;
    session.signalsForClient = [];
    return queue;
  }
}

/**
 * Clears all active relay sessions (used for test isolation).
 */
export function clearMotionRelaySessions(): void {
  sessions.clear();
}
