import type { MotionLandmark, MotionPoseSnapshot } from "./motion-engine";

export const MOTION_GAME_DURATION_MS = 60_000;
export const MOTION_GAME_COUNTDOWN_MS = 7_000;

export interface MotionGamePoint {
  x: number;
  y: number;
}

export interface MotionGameTarget extends MotionGamePoint {
  id: number;
  kind: "wide" | "low" | "high";
  radius: number;
  spawnedAt: number;
  expiresAt: number;
}

export interface MotionDuckAttack {
  id: number;
  telegraphAt: number;
  activeAt: number;
  expiresAt: number;
  thresholdY: number;
  startingShoulderY: number;
  requiredDropY: number;
}

export interface MotionGameEffect extends MotionGamePoint {
  id: number;
  type: "hit" | "miss" | "duck" | "damage";
  at: number;
}

interface MotionBodyFrame {
  centerX: number;
  shoulderY: number;
  hipY: number;
  reachX: number;
  duckThresholdY: number;
}

export interface MotionGameState {
  status: "countdown" | "running" | "finished";
  startedAt: number;
  endsAt: number;
  nowMs: number;
  aspectRatio: number;
  score: number;
  combo: number;
  bestCombo: number;
  hearts: number;
  hits: number;
  misses: number;
  dodges: number;
  target: MotionGameTarget | null;
  duck: MotionDuckAttack | null;
  duckPending: boolean;
  nextSpawnAt: number;
  resolvedPunches: number;
  spawnIndex: number;
  lastPoseTimestamp: number;
  previousLeftHand: MotionGamePoint | null;
  previousRightHand: MotionGamePoint | null;
  body: MotionBodyFrame;
  effect: MotionGameEffect | null;
  finishReason: "time" | "hearts" | null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function landmarkPoint(
  landmarks: readonly MotionLandmark[],
  index: number,
  minimumVisibility = 0.35,
): MotionGamePoint | null {
  const landmark = landmarks[index];
  if (!landmark || (landmark.visibility ?? 1) < minimumVisibility) return null;
  return { x: landmark.x, y: landmark.y };
}

function calibrationPoint(
  landmarks: readonly MotionLandmark[],
  index: number,
): MotionGamePoint | null {
  const landmark = landmarks[index];
  if (
    !landmark ||
    !Number.isFinite(landmark.x) ||
    !Number.isFinite(landmark.y) ||
    landmark.x < -0.25 ||
    landmark.x > 1.25 ||
    landmark.y < -0.25 ||
    landmark.y > 1.25
  ) {
    return null;
  }
  return { x: landmark.x, y: landmark.y };
}

function bodyFrame(snapshot: MotionPoseSnapshot): MotionBodyFrame | null {
  const leftShoulder = calibrationPoint(snapshot.landmarks, 11);
  const rightShoulder = calibrationPoint(snapshot.landmarks, 12);
  if (!leftShoulder || !rightShoulder) return null;

  const leftHip = calibrationPoint(snapshot.landmarks, 23);
  const rightHip = calibrationPoint(snapshot.landmarks, 24);
  const nose = calibrationPoint(snapshot.landmarks, 0);

  const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulderWidth = Math.max(0.08, Math.abs(leftShoulder.x - rightShoulder.x));
  const measuredHipY = leftHip && rightHip ? (leftHip.y + rightHip.y) / 2 : null;
  const hipY =
    measuredHipY && measuredHipY > shoulderY + 0.06
      ? measuredHipY
      : clamp(shoulderY + shoulderWidth * 1.55, shoulderY + 0.14, 0.88);
  const hipCenterX = leftHip && rightHip ? (leftHip.x + rightHip.x) / 2 : shoulderCenterX;
  const centerX = shoulderCenterX * 0.7 + hipCenterX * 0.3;
  const noseY =
    nose && nose.y < shoulderY - 0.035
      ? nose.y
      : shoulderY - Math.max(0.09, shoulderWidth * 0.8);
  const headToShoulder = Math.max(0.08, shoulderY - noseY);
  return {
    centerX,
    shoulderY,
    hipY,
    reachX: clamp(shoulderWidth * 1.65, 0.2, 0.34),
    duckThresholdY: clamp(
      noseY + headToShoulder * 0.62,
      noseY + 0.045,
      shoulderY - 0.015,
    ),
  };
}

export function canStartMotionGame(snapshot: MotionPoseSnapshot): boolean {
  return bodyFrame(snapshot) !== null;
}

export function pointToSegmentDistance(
  point: MotionGamePoint,
  from: MotionGamePoint,
  to: MotionGamePoint,
  aspectRatio = 4 / 3,
): number {
  const px = point.x * aspectRatio;
  const py = point.y;
  const ax = from.x * aspectRatio;
  const ay = from.y;
  const bx = to.x * aspectRatio;
  const by = to.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const projection = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
  return Math.hypot(px - (ax + projection * dx), py - (ay + projection * dy));
}

function targetPosition(
  state: MotionGameState,
  landmarks: readonly MotionLandmark[],
): MotionGamePoint & { kind: MotionGameTarget["kind"] } {
  const torsoHeight = Math.max(0.12, state.body.hipY - state.body.shoulderY);
  const wideDistance = clamp(state.body.reachX * 1.42, 0.32, 0.46);
  const lowY = clamp(
    state.body.hipY + torsoHeight * 0.72,
    state.body.shoulderY + 0.34,
    0.9,
  );
  const highY = clamp(
    state.body.shoulderY - torsoHeight * 0.72,
    0.08,
    state.body.shoulderY - 0.16,
  );
  const slots = [
    { kind: "wide" as const, x: state.body.centerX - wideDistance, y: state.body.shoulderY + torsoHeight * 0.1 },
    { kind: "wide" as const, x: state.body.centerX + wideDistance, y: state.body.shoulderY + torsoHeight * 0.1 },
    { kind: "low" as const, x: state.body.centerX - state.body.reachX * 0.45, y: lowY },
    { kind: "low" as const, x: state.body.centerX + state.body.reachX * 0.45, y: lowY },
    { kind: "high" as const, x: state.body.centerX - state.body.reachX * 0.58, y: highY },
    { kind: "high" as const, x: state.body.centerX + state.body.reachX * 0.58, y: highY },
  ].map((slot) => ({ ...slot, x: clamp(slot.x, 0.06, 0.94), y: clamp(slot.y, 0.07, 0.9) }));
  const hands = [landmarkPoint(landmarks, 15), landmarkPoint(landmarks, 16)].filter(
    (point): point is MotionGamePoint => point !== null,
  );

  for (let offset = 0; offset < slots.length; offset += 1) {
    const slot = slots[(state.spawnIndex + offset) % slots.length];
    const safelyAway = hands.every(
      (hand) => pointToSegmentDistance(slot, hand, hand, state.aspectRatio) > 0.13,
    );
    if (safelyAway) return slot;
  }
  return slots[state.spawnIndex % slots.length];
}

function spawnNext(state: MotionGameState, snapshot: MotionPoseSnapshot, nowMs: number): MotionGameState {
  if (state.duckPending) {
    const liveBody = bodyFrame(snapshot) ?? state.body;
    const nose = landmarkPoint(snapshot.landmarks, 0, 0.2);
    const leftShoulder = landmarkPoint(snapshot.landmarks, 11, 0.2);
    const rightShoulder = landmarkPoint(snapshot.landmarks, 12, 0.2);
    const startingShoulderY =
      leftShoulder && rightShoulder
        ? (leftShoulder.y + rightShoulder.y) / 2
        : liveBody.shoulderY;
    const startingNoseY = nose?.y ?? startingShoulderY - 0.11;
    const headToShoulder = Math.max(0.07, startingShoulderY - startingNoseY);
    const requiredDropY = clamp(headToShoulder * 0.42, 0.045, 0.085);
    const thresholdY = startingShoulderY - 0.008;
    return {
      ...state,
      body: liveBody,
      duckPending: false,
      duck: {
        id: state.spawnIndex + 1,
        telegraphAt: nowMs,
        activeAt: nowMs + 850,
        expiresAt: nowMs + 2_350,
        thresholdY,
        startingShoulderY,
        requiredDropY,
      },
      spawnIndex: state.spawnIndex + 1,
    };
  }
  const position = targetPosition(state, snapshot.landmarks);
  const lifetimeMs = position.kind === "low" ? 2_300 : position.kind === "wide" ? 2_050 : 1_900;
  return {
    ...state,
    target: {
      id: state.spawnIndex + 1,
      ...position,
      radius: position.kind === "wide" ? 0.06 : 0.064,
      spawnedAt: nowMs,
      expiresAt: nowMs + lifetimeMs,
    },
    spawnIndex: state.spawnIndex + 1,
  };
}

export function startMotionGame(
  snapshot: MotionPoseSnapshot,
  nowMs: number,
  aspectRatio = 4 / 3,
): MotionGameState | null {
  const body = bodyFrame(snapshot);
  if (!body) return null;
  const leftHand = landmarkPoint(snapshot.landmarks, 15);
  const rightHand = landmarkPoint(snapshot.landmarks, 16);
  const startedAt = nowMs + MOTION_GAME_COUNTDOWN_MS;
  return {
    status: "countdown",
    startedAt,
    endsAt: startedAt + MOTION_GAME_DURATION_MS,
    nowMs,
    aspectRatio,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hearts: 3,
    hits: 0,
    misses: 0,
    dodges: 0,
    target: null,
    duck: null,
    duckPending: false,
    nextSpawnAt: startedAt,
    resolvedPunches: 0,
    spawnIndex: 0,
    lastPoseTimestamp: snapshot.timestampMs,
    previousLeftHand: leftHand,
    previousRightHand: rightHand,
    body,
    effect: null,
    finishReason: null,
  };
}

export function advanceMotionGame(
  current: MotionGameState,
  snapshot: MotionPoseSnapshot,
  nowMs: number,
): MotionGameState {
  let state: MotionGameState = { ...current, nowMs };
  if (state.status === "finished") return state;
  if (nowMs >= state.endsAt || state.hearts <= 0) {
    return {
      ...state,
      status: "finished",
      target: null,
      duck: null,
      finishReason: state.hearts <= 0 ? "hearts" : "time",
    };
  }
  if (state.status === "countdown") {
    const latestBody = bodyFrame(snapshot);
    if (nowMs < state.startedAt) {
      if (snapshot.timestampMs === state.lastPoseTimestamp) return state;
      return {
        ...state,
        body: latestBody ?? state.body,
        lastPoseTimestamp: snapshot.timestampMs,
        previousLeftHand: landmarkPoint(snapshot.landmarks, 15) ?? state.previousLeftHand,
        previousRightHand: landmarkPoint(snapshot.landmarks, 16) ?? state.previousRightHand,
      };
    }
    state = { ...state, status: "running", body: latestBody ?? state.body };
  }

  if (state.target && nowMs >= state.target.expiresAt) {
    const resolvedPunches = state.resolvedPunches + 1;
    state = {
      ...state,
      target: null,
      combo: 0,
      misses: state.misses + 1,
      resolvedPunches,
      duckPending: resolvedPunches % 4 === 0,
      nextSpawnAt: nowMs + 280,
      effect: { id: state.spawnIndex + 10_000, type: "miss", x: state.target.x, y: state.target.y, at: nowMs },
    };
  }
  if (state.duck && nowMs >= state.duck.expiresAt) {
    const hearts = Math.max(0, state.hearts - 1);
    state = {
      ...state,
      duck: null,
      hearts,
      combo: 0,
      misses: state.misses + 1,
      nextSpawnAt: nowMs + 450,
      effect: { id: state.spawnIndex + 20_000, type: "damage", x: 0.5, y: state.duck.thresholdY, at: nowMs },
    };
    if (hearts === 0) {
      return { ...state, status: "finished", finishReason: "hearts" };
    }
  }
  if (!state.target && !state.duck && nowMs >= state.nextSpawnAt) {
    state = spawnNext(state, snapshot, nowMs);
  }

  if (snapshot.timestampMs === state.lastPoseTimestamp) return state;
  const leftHand = landmarkPoint(snapshot.landmarks, 15);
  const rightHand = landmarkPoint(snapshot.landmarks, 16);

  if (state.target) {
    const collisionRadius = state.target.radius + 0.045;
    const leftHit =
      leftHand && state.previousLeftHand
        ? pointToSegmentDistance(state.target, state.previousLeftHand, leftHand, state.aspectRatio) <= collisionRadius
        : false;
    const rightHit =
      rightHand && state.previousRightHand
        ? pointToSegmentDistance(state.target, state.previousRightHand, rightHand, state.aspectRatio) <= collisionRadius
        : false;
    if (leftHit || rightHit) {
      const combo = state.combo + 1;
      const resolvedPunches = state.resolvedPunches + 1;
      state = {
        ...state,
        score: state.score + 100 + state.combo * 20,
        combo,
        bestCombo: Math.max(state.bestCombo, combo),
        hits: state.hits + 1,
        target: null,
        resolvedPunches,
        duckPending: resolvedPunches % 4 === 0,
        nextSpawnAt: nowMs + 220,
        effect: { id: state.spawnIndex + 30_000, type: "hit", x: state.target.x, y: state.target.y, at: nowMs },
      };
    }
  }

  if (state.duck && nowMs >= state.duck.activeAt) {
    const nose = landmarkPoint(snapshot.landmarks, 0);
    const leftShoulder = landmarkPoint(snapshot.landmarks, 11);
    const rightShoulder = landmarkPoint(snapshot.landmarks, 12);
    const shoulderY =
      leftShoulder && rightShoulder
        ? (leftShoulder.y + rightShoulder.y) / 2
        : null;
    const headClearedLine = Boolean(nose && nose.y >= state.duck.thresholdY);
    const shouldersDropped = Boolean(
      shoulderY !== null &&
      shoulderY >= state.duck.startingShoulderY + state.duck.requiredDropY * 0.65,
    );
    if (headClearedLine || shouldersDropped) {
      const combo = state.combo + 1;
      state = {
        ...state,
        score: state.score + 160 + state.combo * 20,
        combo,
        bestCombo: Math.max(state.bestCombo, combo),
        dodges: state.dodges + 1,
        duck: null,
        nextSpawnAt: nowMs + 380,
        effect: { id: state.spawnIndex + 40_000, type: "duck", x: 0.5, y: state.duck.thresholdY, at: nowMs },
      };
    }
  }

  return {
    ...state,
    lastPoseTimestamp: snapshot.timestampMs,
    previousLeftHand: leftHand ?? state.previousLeftHand,
    previousRightHand: rightHand ?? state.previousRightHand,
  };
}

export function motionGameSecondsRemaining(state: MotionGameState): number {
  if (state.status === "countdown") return MOTION_GAME_DURATION_MS / 1000;
  return Math.max(0, Math.ceil((state.endsAt - state.nowMs) / 1000));
}

export function motionGameCountdown(state: MotionGameState): number {
  if (state.status !== "countdown") return 0;
  return Math.max(1, Math.ceil((state.startedAt - state.nowMs) / 1000));
}

export function pauseMotionGameFor(state: MotionGameState, durationMs: number): MotionGameState {
  const offset = Math.max(0, durationMs);
  if (offset === 0 || state.status === "finished") return state;
  return {
    ...state,
    startedAt: state.startedAt + offset,
    endsAt: state.endsAt + offset,
    nowMs: state.nowMs + offset,
    nextSpawnAt: state.nextSpawnAt + offset,
    target: state.target
      ? {
          ...state.target,
          spawnedAt: state.target.spawnedAt + offset,
          expiresAt: state.target.expiresAt + offset,
        }
      : null,
    duck: state.duck
      ? {
          ...state.duck,
          telegraphAt: state.duck.telegraphAt + offset,
          activeAt: state.duck.activeAt + offset,
          expiresAt: state.duck.expiresAt + offset,
        }
      : null,
    effect: state.effect ? { ...state.effect, at: state.effect.at + offset } : null,
  };
}
