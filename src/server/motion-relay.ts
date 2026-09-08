import type { MotionPairingState, MotionSensorFrame } from "@/lib/motion-remote";
import { createPairingSession, isPairingSessionValid } from "@/lib/motion-remote";

export interface MotionRelaySignal {
  from: "host" | "client";
  type: "offer" | "answer" | "candidate";
  sdp?: string;
  candidate?: unknown;
  timestampMs?: number;
}

export interface MotionRelaySessionState {
  pairing: MotionPairingState;
  latestFrame: MotionSensorFrame | null;
  signalsForHost: MotionRelaySignal[];
  signalsForClient: MotionRelaySignal[];
  lastActiveMs: number;
}

const sessions = new Map<string, MotionRelaySessionState>();

/**
 * Creates or resets a motion relay session with the specified pairing code.
 *
 * @param pairingCode - 6-character uppercase pairing code.
 * @param nowMs - Optional current timestamp in milliseconds.
 * @returns Initialized pairing state.
 */
export function createRelaySession(
  pairingCode: string,
  nowMs: number = Date.now(),
): MotionPairingState {
  const cleanCode = pairingCode.toUpperCase().trim();
  const pairing = createPairingSession(cleanCode, nowMs);
  const state: MotionRelaySessionState = {
    pairing,
    latestFrame: null,
    signalsForHost: [],
    signalsForClient: [],
    lastActiveMs: nowMs,
  };
  sessions.set(cleanCode, state);
  return pairing;
}

/**
 * Retrieves an active relay session by pairing code, pruning expired sessions automatically.
 *
 * @param pairingCode - 6-character code.
 * @param nowMs - Current timestamp in milliseconds.
 * @returns Session state or null if not found or expired.
 */
export function getRelaySession(
  pairingCode: string,
  nowMs: number = Date.now(),
): MotionRelaySessionState | null {
  const cleanCode = pairingCode.toUpperCase().trim();
  const session = sessions.get(cleanCode);
  if (!session) {
    return null;
  }
  if (!isPairingSessionValid(session.pairing, nowMs)) {
    sessions.delete(cleanCode);
    return null;
  }
  return session;
}

/**
 * Stores the latest sensor landmark frame from the client device.
 *
 * @param pairingCode - 6-character pairing code.
 * @param frame - Incoming sensor frame payload.
 * @param nowMs - Current timestamp in milliseconds.
 */
export function postRelayFrame(
  pairingCode: string,
  frame: MotionSensorFrame,
  nowMs: number = Date.now(),
): boolean {
  const session = getRelaySession(pairingCode, nowMs);
  if (!session) {
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
 *
 * @param pairingCode - 6-character pairing code.
 * @returns Most recent MotionSensorFrame, or null.
 */
export function getLatestRelayFrame(
  pairingCode: string,
  nowMs: number = Date.now(),
): MotionSensorFrame | null {
  const session = getRelaySession(pairingCode, nowMs);
  return session?.latestFrame ?? null;
}

/**
 * Appends a WebRTC signaling message (offer, answer, or ICE candidate) destined for the peer.
 *
 * @param pairingCode - 6-character pairing code.
 * @param signal - WebRTC signaling payload.
 */
export function postRelaySignal(
  pairingCode: string,
  signal: MotionRelaySignal,
  nowMs: number = Date.now(),
): boolean {
  const session = getRelaySession(pairingCode, nowMs);
  if (!session) {
    return false;
  }
  const timestamped = {
    ...signal,
    timestampMs: nowMs,
  };
  if (signal.from === "host") {
    session.signalsForClient.push(timestamped);
  } else {
    session.signalsForHost.push(timestamped);
  }
  session.lastActiveMs = nowMs;
  return true;
}

/**
 * Drains and returns queued WebRTC signaling messages for a given recipient role (host or client).
 *
 * @param pairingCode - 6-character pairing code.
 * @param forRole - Recipient role ("host" or "client").
 * @returns Array of queued signaling messages.
 */
export function getRelaySignals(
  pairingCode: string,
  forRole: "host" | "client",
  nowMs: number = Date.now(),
): MotionRelaySignal[] {
  const session = getRelaySession(pairingCode, nowMs);
  if (!session) {
    return [];
  }
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
