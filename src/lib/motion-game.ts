import type { MotionLandmark, MotionPoseSnapshot } from "./motion-engine";

export const MOTION_GAME_DURATION_MS = 60_000;
export const MOTION_GAME_COUNTDOWN_MS = 7_000;

export type MotionGameDifficulty = "easy" | "medium" | "hard";
export type MotionGameTargetKind = "wide" | "low" | "high" | "kick" | "dual";

export interface MotionGamePoint {
  x: number;
  y: number;
}

export interface MotionGameTarget extends MotionGamePoint {
  id: number;
  kind: MotionGameTargetKind;
  radius: number;
  spawnedAt: number;
  expiresAt: number;
  pairedWithId?: number;
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
  type: "hit" | "miss" | "duck" | "damage" | "kick" | "double";
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
  difficulty: MotionGameDifficulty;
  allowKicks: boolean;
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
  secondaryTarget: MotionGameTarget | null;
  duck: MotionDuckAttack | null;
  duckPending: boolean;
  nextSpawnAt: number;
  resolvedPunches: number;
  spawnIndex: number;
  lastPoseTimestamp: number;
  previousLeftHand: MotionGamePoint | null;
  previousRightHand: MotionGamePoint | null;
  previousLeftFoot: MotionGamePoint | null;
  previousRightFoot: MotionGamePoint | null;
  previousLeftKnee: MotionGamePoint | null;
  previousRightKnee: MotionGamePoint | null;
  body: MotionBodyFrame;
  effect: MotionGameEffect | null;
  finishReason: "time" | "hearts" | null;
}

interface DifficultyConfig {
  targetLifetimeMs: { wide: number; low: number; high: number; kick: number; dual: number };
  targetRadius: number;
  duckFrequency: number;
  duckTelegraphMs: number;
  duckDurationMs: number;
  allowDualTargets: boolean;
  nextSpawnDelayMs: number;
}

export const DIFFICULTY_CONFIGS: Record<MotionGameDifficulty, DifficultyConfig> = {
  easy: {
    targetLifetimeMs: { wide: 2_600, low: 2_900, high: 2_500, kick: 2_800, dual: 2_800 },
    targetRadius: 0.075,
    duckFrequency: 5,
    duckTelegraphMs: 1_100,
    duckDurationMs: 2_700,
    allowDualTargets: false,
    nextSpawnDelayMs: 320,
  },
  medium: {
    targetLifetimeMs: { wide: 2_050, low: 2_300, high: 1_900, kick: 2_200, dual: 2_200 },
    targetRadius: 0.062,
    duckFrequency: 4,
    duckTelegraphMs: 850,
    duckDurationMs: 2_350,
    allowDualTargets: true,
    nextSpawnDelayMs: 220,
  },
  hard: {
    targetLifetimeMs: { wide: 1_350, low: 1_500, high: 1_250, kick: 1_400, dual: 1_400 },
    targetRadius: 0.054,
    duckFrequency: 3,
    duckTelegraphMs: 650,
    duckDurationMs: 1_850,
    allowDualTargets: true,
    nextSpawnDelayMs: 160,
  },
};

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

function primaryFootPoint(
  landmarks: readonly MotionLandmark[],
  ankleIndex: number,
  footIndex: number,
  heelIndex: number,
): MotionGamePoint | null {
  return (
    landmarkPoint(landmarks, footIndex, 0.25) ??
    landmarkPoint(landmarks, ankleIndex, 0.25) ??
    landmarkPoint(landmarks, heelIndex, 0.25)
  );
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
  forceKind?: MotionGameTargetKind,
): MotionGamePoint & { kind: MotionGameTargetKind } {
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
  const kickY = clamp(
    state.body.hipY + torsoHeight * 0.92,
    0.68,
    0.88,
  );

  if (forceKind === "kick") {
    const side = (state.spawnIndex % 2 === 0) ? -1 : 1;
    return {
      kind: "kick",
      x: clamp(state.body.centerX + side * state.body.reachX * 0.62, 0.1, 0.9),
      y: kickY,
    };
  }

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
  const config = DIFFICULTY_CONFIGS[state.difficulty];

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
        activeAt: nowMs + config.duckTelegraphMs,
        expiresAt: nowMs + config.duckDurationMs,
        thresholdY,
        startingShoulderY,
        requiredDropY,
      },
      spawnIndex: state.spawnIndex + 1,
    };
  }

  // Bestäm måltyp utifrån svårighetsgrad och spelmönster
  const shouldSpawnDual =
    config.allowDualTargets &&
    state.resolvedPunches >= 3 &&
    state.spawnIndex % 4 === 1;

  const shouldSpawnKick =
    state.allowKicks &&
    state.resolvedPunches >= 2 &&
    state.spawnIndex % 4 === 3;

  if (shouldSpawnDual) {
    const wideDistance = clamp(state.body.reachX * 1.35, 0.3, 0.44);
    const y = state.body.shoulderY + 0.04;
    const lifetimeMs = config.targetLifetimeMs.dual;
    const targetA: MotionGameTarget = {
      id: state.spawnIndex + 1,
      kind: "dual",
      x: clamp(state.body.centerX - wideDistance, 0.08, 0.92),
      y,
      radius: config.targetRadius,
      spawnedAt: nowMs,
      expiresAt: nowMs + lifetimeMs,
      pairedWithId: state.spawnIndex + 2,
    };
    const targetB: MotionGameTarget = {
      id: state.spawnIndex + 2,
      kind: "dual",
      x: clamp(state.body.centerX + wideDistance, 0.08, 0.92),
      y,
      radius: config.targetRadius,
      spawnedAt: nowMs,
      expiresAt: nowMs + lifetimeMs,
      pairedWithId: state.spawnIndex + 1,
    };
    return {
      ...state,
      target: targetA,
      secondaryTarget: targetB,
      spawnIndex: state.spawnIndex + 2,
    };
  }

  const forcedKind = shouldSpawnKick ? "kick" : undefined;
  const position = targetPosition(state, snapshot.landmarks, forcedKind);
  const lifetimeMs = config.targetLifetimeMs[position.kind];
  const radius = position.kind === "kick" ? config.targetRadius * 1.15 : config.targetRadius;

  return {
    ...state,
    target: {
      id: state.spawnIndex + 1,
      ...position,
      radius,
      spawnedAt: nowMs,
      expiresAt: nowMs + lifetimeMs,
    },
    secondaryTarget: null,
    spawnIndex: state.spawnIndex + 1,
  };
}

export function startMotionGame(
  snapshot: MotionPoseSnapshot,
  nowMs: number,
  aspectRatio = 4 / 3,
  options?: {
    difficulty?: MotionGameDifficulty;
    allowKicks?: boolean;
  },
): MotionGameState | null {
  const body = bodyFrame(snapshot);
  if (!body) return null;
  const leftHand = landmarkPoint(snapshot.landmarks, 15);
  const rightHand = landmarkPoint(snapshot.landmarks, 16);
  const leftFoot = primaryFootPoint(snapshot.landmarks, 27, 31, 29);
  const rightFoot = primaryFootPoint(snapshot.landmarks, 28, 32, 30);
  const leftKnee = landmarkPoint(snapshot.landmarks, 25);
  const rightKnee = landmarkPoint(snapshot.landmarks, 26);
  const startedAt = nowMs + MOTION_GAME_COUNTDOWN_MS;
  const difficulty = options?.difficulty ?? "medium";
  const allowKicks = options?.allowKicks ?? (leftFoot !== null && rightFoot !== null);

  return {
    status: "countdown",
    difficulty,
    allowKicks,
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
    secondaryTarget: null,
    duck: null,
    duckPending: false,
    nextSpawnAt: startedAt,
    resolvedPunches: 0,
    spawnIndex: 0,
    lastPoseTimestamp: snapshot.timestampMs,
    previousLeftHand: leftHand,
    previousRightHand: rightHand,
    previousLeftFoot: leftFoot,
    previousRightFoot: rightFoot,
    previousLeftKnee: leftKnee,
    previousRightKnee: rightKnee,
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
      secondaryTarget: null,
      duck: null,
      finishReason: state.hearts <= 0 ? "hearts" : "time",
    };
  }

  const leftHand = landmarkPoint(snapshot.landmarks, 15);
  const rightHand = landmarkPoint(snapshot.landmarks, 16);
  const leftFoot = primaryFootPoint(snapshot.landmarks, 27, 31, 29);
  const rightFoot = primaryFootPoint(snapshot.landmarks, 28, 32, 30);
  const leftKnee = landmarkPoint(snapshot.landmarks, 25);
  const rightKnee = landmarkPoint(snapshot.landmarks, 26);

  if (state.status === "countdown") {
    const latestBody = bodyFrame(snapshot);
    if (nowMs < state.startedAt) {
      if (snapshot.timestampMs === state.lastPoseTimestamp) return state;
      return {
        ...state,
        body: latestBody ?? state.body,
        lastPoseTimestamp: snapshot.timestampMs,
        previousLeftHand: leftHand ?? state.previousLeftHand,
        previousRightHand: rightHand ?? state.previousRightHand,
        previousLeftFoot: leftFoot ?? state.previousLeftFoot,
        previousRightFoot: rightFoot ?? state.previousRightFoot,
        previousLeftKnee: leftKnee ?? state.previousLeftKnee,
        previousRightKnee: rightKnee ?? state.previousRightKnee,
      };
    }
    state = { ...state, status: "running", body: latestBody ?? state.body };
  }

  const config = DIFFICULTY_CONFIGS[state.difficulty];

  // Kontrollera om mål löpt ut
  const targetExpired = state.target && nowMs >= state.target.expiresAt;
  const secondaryExpired = state.secondaryTarget && nowMs >= state.secondaryTarget.expiresAt;
  if (targetExpired || secondaryExpired) {
    const resolvedPunches = state.resolvedPunches + 1;
    state = {
      ...state,
      target: null,
      secondaryTarget: null,
      combo: 0,
      misses: state.misses + 1,
      resolvedPunches,
      duckPending: resolvedPunches % config.duckFrequency === 0,
      nextSpawnAt: nowMs + config.nextSpawnDelayMs + 80,
      effect: {
        id: state.spawnIndex + 10_000,
        type: "miss",
        x: state.target?.x ?? state.secondaryTarget?.x ?? 0.5,
        y: state.target?.y ?? state.secondaryTarget?.y ?? 0.5,
        at: nowMs,
      },
    };
  }

  // Kontrollera om duck-attack löpt ut
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

  if (!state.target && !state.secondaryTarget && !state.duck && nowMs >= state.nextSpawnAt) {
    state = spawnNext(state, snapshot, nowMs);
  }

  if (snapshot.timestampMs === state.lastPoseTimestamp) return state;

  // Kollisionskontroll mot primärt och sekundärt mål
  const checkHitOnTarget = (target: MotionGameTarget): boolean => {
    const isKickTarget = target.kind === "kick";
    const collisionRadius = target.radius + (isKickTarget ? 0.065 : 0.045);

    // Sparkar: kontrollera fötter och knän
    if (isKickTarget) {
      const leftFootHit =
        leftFoot && state.previousLeftFoot
          ? pointToSegmentDistance(target, state.previousLeftFoot, leftFoot, state.aspectRatio) <= collisionRadius
          : false;
      const rightFootHit =
        rightFoot && state.previousRightFoot
          ? pointToSegmentDistance(target, state.previousRightFoot, rightFoot, state.aspectRatio) <= collisionRadius
          : false;
      const leftKneeHit =
        leftKnee && state.previousLeftKnee
          ? pointToSegmentDistance(target, state.previousLeftKnee, leftKnee, state.aspectRatio) <= collisionRadius
          : false;
      const rightKneeHit =
        rightKnee && state.previousRightKnee
          ? pointToSegmentDistance(target, state.previousRightKnee, rightKnee, state.aspectRatio) <= collisionRadius
          : false;
      if (leftFootHit || rightFootHit || leftKneeHit || rightKneeHit) return true;
    }

    // Slag: kontrollera händerna
    const leftHandHit =
      leftHand && state.previousLeftHand
        ? pointToSegmentDistance(target, state.previousLeftHand, leftHand, state.aspectRatio) <= collisionRadius
        : false;
    const rightHandHit =
      rightHand && state.previousRightHand
        ? pointToSegmentDistance(target, state.previousRightHand, rightHand, state.aspectRatio) <= collisionRadius
        : false;
    return leftHandHit || rightHandHit;
  };

  let hitTargetA = false;
  let hitTargetB = false;

  if (state.target && checkHitOnTarget(state.target)) {
    hitTargetA = true;
  }
  if (state.secondaryTarget && checkHitOnTarget(state.secondaryTarget)) {
    hitTargetB = true;
  }

  if (hitTargetA || hitTargetB) {
    const isDual = (state.target?.kind === "dual" || state.secondaryTarget?.kind === "dual");
    const resolvedBoth = isDual && (
      (hitTargetA && hitTargetB) ||
      (hitTargetA && !state.secondaryTarget) ||
      (hitTargetB && !state.target)
    );
    const isKick = state.target?.kind === "kick" || state.secondaryTarget?.kind === "kick";

    if (resolvedBoth) {
      // Dubbelslag helt avklarat!
      const addedHits = hitTargetA && hitTargetB ? 2 : 1;
      const combo = state.combo + addedHits;
      const resolvedPunches = state.resolvedPunches + addedHits;
      state = {
        ...state,
        score: state.score + 300 + state.combo * 30,
        combo,
        bestCombo: Math.max(state.bestCombo, combo),
        hits: state.hits + addedHits,
        target: null,
        secondaryTarget: null,
        resolvedPunches,
        duckPending: resolvedPunches % config.duckFrequency === 0,
        nextSpawnAt: nowMs + config.nextSpawnDelayMs,
        effect: { id: state.spawnIndex + 35_000, type: "double", x: state.body.centerX, y: state.body.shoulderY, at: nowMs },
      };
    } else if (isDual) {
      // En av de två noderna träffades
      const hitX = hitTargetA ? state.target!.x : state.secondaryTarget!.x;
      const hitY = hitTargetA ? state.target!.y : state.secondaryTarget!.y;
      state = {
        ...state,
        score: state.score + 120,
        hits: state.hits + 1,
        target: hitTargetA ? null : state.target,
        secondaryTarget: hitTargetB ? null : state.secondaryTarget,
        effect: { id: state.spawnIndex + 30_000, type: "hit", x: hitX, y: hitY, at: nowMs },
      };
    } else {
      // Enkelt mål (vanligt eller kick)
      const hitX = state.target?.x ?? 0.5;
      const hitY = state.target?.y ?? 0.5;
      const combo = state.combo + 1;
      const resolvedPunches = state.resolvedPunches + 1;
      const baseScore = isKick ? 150 : 100;
      state = {
        ...state,
        score: state.score + baseScore + state.combo * 20,
        combo,
        bestCombo: Math.max(state.bestCombo, combo),
        hits: state.hits + 1,
        target: null,
        secondaryTarget: null,
        resolvedPunches,
        duckPending: resolvedPunches % config.duckFrequency === 0,
        nextSpawnAt: nowMs + config.nextSpawnDelayMs,
        effect: {
          id: state.spawnIndex + 30_000,
          type: isKick ? "kick" : "hit",
          x: hitX,
          y: hitY,
          at: nowMs,
        },
      };
    }
  }

  // Duck-avkänning
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
    previousLeftFoot: leftFoot ?? state.previousLeftFoot,
    previousRightFoot: rightFoot ?? state.previousRightFoot,
    previousLeftKnee: leftKnee ?? state.previousLeftKnee,
    previousRightKnee: rightKnee ?? state.previousRightKnee,
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
    secondaryTarget: state.secondaryTarget
      ? {
          ...state.secondaryTarget,
          spawnedAt: state.secondaryTarget.spawnedAt + offset,
          expiresAt: state.secondaryTarget.expiresAt + offset,
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
