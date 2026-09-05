import { describe, expect, it } from "vitest";

import { startMotionGame, type MotionGameState } from "./motion-game";
import { motionArenaCue, motionArenaStartCue } from "./motion-announcer";
import type { MotionPoseSnapshot } from "./motion-engine";

function snapshot(): MotionPoseSnapshot {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
  }));
  landmarks[11] = { ...landmarks[11], x: 0.35, y: 0.3 };
  landmarks[12] = { ...landmarks[12], x: 0.65, y: 0.3 };
  landmarks[23] = { ...landmarks[23], x: 0.4, y: 0.65 };
  landmarks[24] = { ...landmarks[24], x: 0.6, y: 0.65 };
  return { capturedAtMs: 0, inferenceMs: 20, landmarks, timestampMs: 0 };
}

function game(overrides: Partial<MotionGameState> = {}): MotionGameState {
  const state = startMotionGame(snapshot(), 1_000);
  if (!state) throw new Error("Expected valid game fixture");
  return { ...state, ...overrides };
}

describe("motion announcer", () => {
  it("starts with a short, high-priority introduction in English and Swedish", () => {
    expect(motionArenaStartCue("en")).toMatchObject({
      kind: "start",
      priority: true,
      text: expect.stringContaining("Neon Guardian approaches"),
    });
    expect(motionArenaStartCue("sv")).toMatchObject({
      kind: "start",
      priority: true,
      text: expect.stringContaining("Neonväktaren vaknar"),
    });
  });

  it("prioritizes go and new duck warnings in English and Swedish", () => {
    const countdown = game();
    const beforeThree = { ...countdown, nowMs: countdown.startedAt - 3_100 };
    const atThree = { ...countdown, nowMs: countdown.startedAt - 2_900 };
    expect(motionArenaCue(beforeThree, atThree, "en")).toMatchObject({
      kind: "countdown",
      priority: true,
      text: "3",
    });
    const running = { ...countdown, status: "running" as const, nowMs: countdown.startedAt };
    expect(motionArenaCue(countdown, running, "en")).toMatchObject({ kind: "go", priority: true, text: "Fight!" });
    expect(motionArenaCue(countdown, running, "sv")).toMatchObject({ kind: "go", priority: true, text: "Kör!" });

    const duck = {
      id: 7,
      telegraphAt: 4_000,
      activeAt: 4_850,
      expiresAt: 6_050,
      thresholdY: 0.28,
      startingShoulderY: 0.36,
      requiredDropY: 0.06,
    };
    expect(motionArenaCue(running, { ...running, duck }, "en")).toMatchObject({
      kind: "duck",
      text: "Duck!",
    });
    expect(motionArenaCue(running, { ...running, duck }, "sv")).toMatchObject({
      kind: "duck",
      text: "Ducka!",
    });
  });

  it("announces combo milestones without narrating every hit", () => {
    const previous = game({ status: "running", combo: 2, effect: null });
    const hit = {
      ...previous,
      combo: 3,
      effect: { id: 4, type: "hit" as const, x: 0.5, y: 0.5, at: 4_000 },
    };
    expect(motionArenaCue(previous, hit, "en")).toMatchObject({ kind: "praise", priority: false, text: "3 hit combo!" });
    expect(motionArenaCue(previous, hit, "sv")).toMatchObject({ kind: "praise", priority: false, text: "3 i combo. Snyggt!" });
    expect(motionArenaCue(hit, { ...hit, combo: 4 }, "en")).toBeNull();
  });

  it("announces damage, time milestones and the final result", () => {
    const running = game({ status: "running", nowMs: 31_000, hearts: 3 });
    const damage = {
      ...running,
      hearts: 2,
      effect: { id: 8, type: "damage" as const, x: 0.5, y: 0.5, at: 32_000 },
    };
    expect(motionArenaCue(running, damage, "en")).toMatchObject({ kind: "damage", priority: true, text: "2 hearts left! Stay up!" });

    const beforeHalf = game({ status: "running", startedAt: 0, endsAt: 60_000, nowMs: 29_500 });
    expect(motionArenaCue(beforeHalf, { ...beforeHalf, nowMs: 30_100 }, "en")).toMatchObject({ kind: "halfway", text: "Halfway! Keep moving!" });
    const beforeFinal = { ...beforeHalf, nowMs: 49_500 };
    expect(motionArenaCue(beforeFinal, { ...beforeFinal, nowMs: 50_100 }, "en")).toMatchObject({ kind: "final", text: "Ten seconds left!" });

    const finished = { ...running, status: "finished" as const, score: 900, hits: 7, dodges: 2, finishReason: "time" as const };
    expect(motionArenaCue(running, finished, "en")).toMatchObject({
      kind: "finish",
      priority: true,
      text: expect.stringContaining("Time's up! Final score: 900 points"),
    });
    expect(motionArenaCue(running, finished, "sv")).toMatchObject({
      kind: "finish",
      priority: true,
      text: expect.stringContaining("Tiden är ute. 900 poäng"),
    });
  });
});
