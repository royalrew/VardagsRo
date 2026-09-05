import { describe, expect, it } from "vitest";

import type { MotionLandmark, MotionPoseSnapshot } from "./motion-engine";
import {
  MOTION_GAME_COUNTDOWN_MS,
  advanceMotionGame,
  canStartMotionGame,
  pauseMotionGameFor,
  pointToSegmentDistance,
  startMotionGame,
} from "./motion-game";

function pose(timestampMs: number, overrides: Record<number, Partial<MotionLandmark>> = {}): MotionPoseSnapshot {
  const landmarks = Array.from({ length: 33 }, (_, index): MotionLandmark => ({
    x: 0.5,
    y: 0.3 + index * 0.005,
    z: 0,
    visibility: 1,
    ...overrides[index],
  }));
  landmarks[0] = { x: 0.5, y: 0.2, z: 0, visibility: 1, ...overrides[0] };
  landmarks[11] = { x: 0.42, y: 0.36, z: 0, visibility: 1, ...overrides[11] };
  landmarks[12] = { x: 0.58, y: 0.36, z: 0, visibility: 1, ...overrides[12] };
  landmarks[15] = { x: 0.43, y: 0.52, z: 0, visibility: 1, ...overrides[15] };
  landmarks[16] = { x: 0.57, y: 0.52, z: 0, visibility: 1, ...overrides[16] };
  landmarks[23] = { x: 0.45, y: 0.62, z: 0, visibility: 1, ...overrides[23] };
  landmarks[24] = { x: 0.55, y: 0.62, z: 0, visibility: 1, ...overrides[24] };
  return { capturedAtMs: timestampMs, timestampMs, inferenceMs: 10, landmarks };
}

describe("motion-game", () => {
  it("pauses every active game deadline during pose-worker recovery", () => {
    const initial = startMotionGame(pose(1), 1_000)!;
    const running = advanceMotionGame(initial, pose(2), initial.startedAt);
    const paused = pauseMotionGameFor(running, 750);

    expect(paused.endsAt).toBe(running.endsAt + 750);
    expect(paused.nowMs).toBe(running.nowMs + 750);
    expect(paused.target!.spawnedAt).toBe(running.target!.spawnedAt + 750);
    expect(paused.target!.expiresAt).toBe(running.target!.expiresAt + 750);
  });

  it("allows bossfight calibration from an upper-body-only landmark set", () => {
    const upperBody = pose(1);
    upperBody.landmarks = upperBody.landmarks.slice(0, 17);

    expect(canStartMotionGame(upperBody)).toBe(true);
    expect(startMotionGame(upperBody, 1_000)).not.toBeNull();
  });

  it("requires both shoulders but not the legs", () => {
    const noRightShoulder = pose(1);
    noRightShoulder.landmarks = noRightShoulder.landmarks.slice(0, 12);

    expect(canStartMotionGame(noRightShoulder)).toBe(false);
  });

  it("detects a fast swept hand even when neither endpoint touches the target", () => {
    expect(
      pointToSegmentDistance(
        { x: 0.5, y: 0.4 },
        { x: 0.2, y: 0.4 },
        { x: 0.8, y: 0.4 },
      ),
    ).toBeCloseTo(0);
  });

  it("calibrates from the body and starts after a short countdown", () => {
    const initial = startMotionGame(pose(1), 1_000);
    expect(initial).not.toBeNull();
    expect(initial?.status).toBe("countdown");
    const movedDuringCountdown = advanceMotionGame(
      initial!,
      pose(2, { 15: { x: 0.25, y: 0.25 } }),
      2_000,
    );
    expect(movedDuringCountdown.previousLeftHand).toEqual({ x: 0.25, y: 0.25 });
    const running = advanceMotionGame(
      movedDuringCountdown,
      pose(2, { 15: { x: 0.25, y: 0.25 } }),
      1_000 + MOTION_GAME_COUNTDOWN_MS,
    );
    expect(running.status).toBe("running");
    expect(running.target).not.toBeNull();
    expect(running.hits).toBe(0);
    expect(running.hearts).toBe(3);
  });

  it("calibrates even when MediaPipe reports weak hip visibility", () => {
    const weakHips = pose(1, {
      0: { visibility: 0.05 },
      23: { visibility: 0.01 },
      24: { visibility: 0.01 },
    });
    const game = startMotionGame(weakHips, 1_000);
    expect(game).not.toBeNull();
    expect(game!.body.hipY).toBeGreaterThan(game!.body.shoulderY);
    expect(game!.body.duckThresholdY).toBeGreaterThan(weakHips.landmarks[0].y);
    expect(game!.body.duckThresholdY).toBeLessThan(game!.body.shoulderY);
  });

  it("keeps calibrating while the player walks to the start position", () => {
    const initial = startMotionGame(pose(1), 1_000)!;
    const repositioned = pose(2, {
      11: { x: 0.32, y: 0.4 },
      12: { x: 0.68, y: 0.4 },
      23: { x: 0.38, y: 0.7 },
      24: { x: 0.62, y: 0.7 },
    });

    const recalibrated = advanceMotionGame(initial, repositioned, 3_000);

    expect(recalibrated.status).toBe("countdown");
    expect(recalibrated.body.shoulderY).toBeCloseTo(0.4);
    expect(recalibrated.body.hipY).toBeCloseTo(0.7);
  });

  it("places the duck line between the neutral head and shoulders", () => {
    const initialPose = pose(1);
    const game = startMotionGame(initialPose, 1_000)!;

    expect(game.body.duckThresholdY).toBeGreaterThan(initialPose.landmarks[0].y + 0.04);
    expect(game.body.duckThresholdY).toBeLessThan(game.body.shoulderY - 0.01);
  });

  it("awards a hit when a wrist crosses the spawned target", () => {
    const initial = startMotionGame(pose(1), 0)!;
    const running = advanceMotionGame(initial, pose(2), MOTION_GAME_COUNTDOWN_MS);
    const target = running.target!;
    const armed = {
      ...running,
      previousLeftHand: { x: target.x - 0.2, y: target.y },
    };
    const after = pose(3, { 15: { x: target.x + 0.2, y: target.y } });
    const hit = advanceMotionGame(armed, after, MOTION_GAME_COUNTDOWN_MS + 40);
    expect(hit.target).toBeNull();
    expect(hit.hits).toBe(1);
    expect(hit.score).toBe(100);
    expect(hit.combo).toBe(1);
  });

  it("cycles through wide, low and high targets that demand body movement", () => {
    const initial = startMotionGame(pose(1), 0)!;
    const running = advanceMotionGame(initial, pose(2), MOTION_GAME_COUNTDOWN_MS);
    expect(running.target).toMatchObject({ kind: "wide" });
    expect(Math.abs(running.target!.x - running.body.centerX)).toBeGreaterThanOrEqual(0.32);

    const low = advanceMotionGame(
      { ...running, target: null, spawnIndex: 2, nextSpawnAt: MOTION_GAME_COUNTDOWN_MS + 1 },
      pose(3),
      MOTION_GAME_COUNTDOWN_MS + 1,
    );
    expect(low.target).toMatchObject({ kind: "low" });
    expect(low.target!.y).toBeGreaterThan(low.body.hipY);
    expect(low.target!.expiresAt - low.target!.spawnedAt).toBe(2_300);

    const high = advanceMotionGame(
      { ...low, target: null, spawnIndex: 4, nextSpawnAt: MOTION_GAME_COUNTDOWN_MS + 2 },
      pose(4),
      MOTION_GAME_COUNTDOWN_MS + 2,
    );
    expect(high.target).toMatchObject({ kind: "high" });
    expect(high.target!.y).toBeLessThan(high.body.shoulderY);
  });

  it("recognizes a duck below the calibrated threshold", () => {
    const initial = startMotionGame(pose(1), 0)!;
    const duckState = {
      ...initial,
      status: "running" as const,
      duck: {
        id: 1,
        telegraphAt: 0,
        activeAt: 100,
        expiresAt: 2_000,
        thresholdY: initial.body.duckThresholdY,
        startingShoulderY: initial.body.shoulderY,
        requiredDropY: 0.06,
      },
      target: null,
      nextSpawnAt: Number.POSITIVE_INFINITY,
    };
    const duckedPose = pose(2, { 0: { y: initial.body.duckThresholdY + 0.04 } });
    const result = advanceMotionGame(duckState, duckedPose, 200);
    expect(result.duck).toBeNull();
    expect(result.dodges).toBe(1);
    expect(result.score).toBe(160);
  });

  it("spawns the duck line at live shoulder height", () => {
    const initial = startMotionGame(pose(1), 0)!;
    const running = {
      ...initial,
      status: "running" as const,
      duckPending: true,
      target: null,
      nextSpawnAt: 100,
    };
    const livePose = pose(2, {
      0: { y: 0.18 },
      11: { y: 0.36 },
      12: { y: 0.36 },
    });

    const spawned = advanceMotionGame(running, livePose, 100);

    expect(spawned.duck).not.toBeNull();
    expect(spawned.duck!.thresholdY).toBeCloseTo(0.352);
    expect(spawned.duck!.thresholdY).toBeLessThan(spawned.body.shoulderY);
  });

  it("accepts a clear shoulder drop when the nose is temporarily hidden", () => {
    const initial = startMotionGame(pose(1), 0)!;
    const duckState = {
      ...initial,
      status: "running" as const,
      duck: {
        id: 2,
        telegraphAt: 0,
        activeAt: 100,
        expiresAt: 2_000,
        thresholdY: 0.27,
        startingShoulderY: 0.36,
        requiredDropY: 0.06,
      },
      target: null,
      nextSpawnAt: Number.POSITIVE_INFINITY,
    };
    const duckedPose = pose(2, {
      0: { visibility: 0.1 },
      11: { y: 0.41 },
      12: { y: 0.41 },
    });

    const result = advanceMotionGame(duckState, duckedPose, 200);

    expect(result.duck).toBeNull();
    expect(result.dodges).toBe(1);
  });

  it("configures different timeouts and hit windows based on difficulty", () => {
    const easy = startMotionGame(pose(1), 0, 16 / 9, { difficulty: "easy" })!;
    const hard = startMotionGame(pose(1), 0, 16 / 9, { difficulty: "hard" })!;

    expect(easy.difficulty).toBe("easy");
    expect(hard.difficulty).toBe("hard");

    const runningEasy = advanceMotionGame(easy, pose(2), MOTION_GAME_COUNTDOWN_MS);
    const runningHard = advanceMotionGame(hard, pose(2), MOTION_GAME_COUNTDOWN_MS);

    expect(runningEasy.target!.radius).toBeGreaterThan(runningHard.target!.radius);
    expect(runningEasy.target!.expiresAt - runningEasy.target!.spawnedAt).toBeGreaterThan(
      runningHard.target!.expiresAt - runningHard.target!.spawnedAt,
    );
  });

  it("awards a kick hit when a foot or knee sweeps through a kick target", () => {
    const initial = startMotionGame(pose(1), 0, 16 / 9, { allowKicks: true, difficulty: "medium" })!;
    const running = advanceMotionGame(initial, pose(2), MOTION_GAME_COUNTDOWN_MS);

    // Force a kick target
    const kickTarget = {
      id: 99,
      x: 0.45,
      y: 0.75,
      radius: 0.1,
      spawnedAt: 1_000,
      expiresAt: 4_000,
      kind: "kick" as const,
    };
    const armedState = {
      ...running,
      target: kickTarget,
      previousLeftFoot: { x: 0.45, y: 0.6 },
    };

    const footMovedPose = pose(3, {
      27: { x: 0.45, y: 0.78, visibility: 0.9 }, // left ankle
    });

    const afterKick = advanceMotionGame(armedState, footMovedPose, 1_050);
    expect(afterKick.target).toBeNull();
    expect(afterKick.hits).toBe(1);
    expect(afterKick.effect?.type).toBe("kick");
    expect(afterKick.score).toBeGreaterThan(100);
  });

  it("handles dual targets requiring both nodes to be hit for full combo", () => {
    const initial = startMotionGame(pose(1), 0, 16 / 9, { difficulty: "hard" })!;
    const running = advanceMotionGame(initial, pose(2), MOTION_GAME_COUNTDOWN_MS);

    const primaryTarget = {
      id: 101,
      x: 0.25,
      y: 0.4,
      radius: 0.08,
      spawnedAt: 1_000,
      expiresAt: 4_000,
      kind: "dual" as const,
    };
    const secondaryTarget = {
      id: 102,
      x: 0.75,
      y: 0.4,
      radius: 0.08,
      spawnedAt: 1_000,
      expiresAt: 4_000,
      kind: "dual" as const,
    };

    const dualState = {
      ...running,
      target: primaryTarget,
      secondaryTarget: secondaryTarget,
      previousLeftHand: { x: 0.2, y: 0.4 },
      previousRightHand: { x: 0.6, y: 0.4 },
    };

    // First hand hits primary target only
    const hitOnePose = pose(3, {
      15: { x: 0.26, y: 0.4, visibility: 0.9 }, // left wrist on primary
      16: { x: 0.62, y: 0.4, visibility: 0.9 }, // right wrist NOT on secondary
    });

    const partialHit = advanceMotionGame(dualState, hitOnePose, 1_040);
    expect(partialHit.target).toBeNull();
    expect(partialHit.secondaryTarget).not.toBeNull();
    expect(partialHit.hits).toBe(1);
    expect(partialHit.effect?.type).toBe("hit"); // partial hit gets standard hit effect

    // Now second hand sweeps the remaining secondary target
    const hitSecondPose = pose(4, {
      16: { x: 0.76, y: 0.4, visibility: 0.9 }, // right wrist hits secondary
    });

    const fullHit = advanceMotionGame(partialHit, hitSecondPose, 1_080);
    expect(fullHit.secondaryTarget).toBeNull();
    expect(fullHit.target).toBeNull();
    expect(fullHit.hits).toBe(2);
    expect(fullHit.effect?.type).toBe("double"); // completes double strike!
  });
});

