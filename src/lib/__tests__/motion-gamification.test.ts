import { describe, expect, it } from "vitest";

import {
  calculateWorkoutXp,
  createDefaultGamificationState,
  evaluateAchievements,
  recordWorkoutGamification,
  type MotionGamificationState,
} from "../motion-gamification";

describe("Motion Gamification & XP Engine (Steg 87)", () => {
  it("initializes default gamification state at Level 1 (Rekryt)", () => {
    const state = createDefaultGamificationState();
    expect(state.xp).toBe(0);
    expect(state.level).toBe(1);
    expect(state.title).toBe("Rekryt");
    expect(state.streakDays).toBe(0);
    expect(state.unlockedAchievements.length).toBe(0);
  });

  it("calculates XP with quality bonus and streak multipliers without distorting exercise incentives", () => {
    // 3 sets, 10 reps each, 92% form score, 0 streak days
    const xpBase = calculateWorkoutXp({
      completedSets: 3,
      totalReps: 30,
      averageFormScore: 92,
      streakDays: 0,
    });

    // 3 sets * 50 = 150 + completion 150 + form bonus 20 = 320 XP
    expect(xpBase.totalXp).toBe(320);
    expect(xpBase.streakBonusXp).toBe(0);

    // With 3-day streak (15% bonus)
    const xpStreak = calculateWorkoutXp({
      completedSets: 3,
      totalReps: 30,
      averageFormScore: 92,
      streakDays: 3,
    });
    expect(xpStreak.streakBonusXp).toBeGreaterThan(0);
    expect(xpStreak.totalXp).toBeGreaterThan(320);
  });

  it("levels up dynamically when XP crosses tier thresholds", () => {
    let state = createDefaultGamificationState();

    state = recordWorkoutGamification(state, {
      completedSets: 3,
      totalReps: 30,
      averageFormScore: 90,
      exercisesUsed: ["squat"],
      now: "2026-09-01T10:00:00Z",
    });

    expect(state.xp).toBeGreaterThan(0);
    expect(state.level).toBe(1);

    // Add large XP grant crossing Level 2 threshold (500 XP)
    state = recordWorkoutGamification(state, {
      completedSets: 6,
      totalReps: 60,
      averageFormScore: 95,
      exercisesUsed: ["pushup", "lunge"],
      now: "2026-09-02T10:00:00Z",
    });

    expect(state.level).toBeGreaterThanOrEqual(2);
    expect(state.title).toBe("Väktare");
  });

  it("unlocks achievements upon meeting milestone conditions", () => {
    let state = createDefaultGamificationState();

    state = recordWorkoutGamification(state, {
      completedSets: 3,
      totalReps: 105,
      averageFormScore: 98,
      exercisesUsed: ["squat", "pushup", "lunge", "jumping-jacks", "plank"],
      now: "2026-09-01T10:00:00Z",
    });

    const unlockedIds = state.unlockedAchievements.map((a) => a.id);
    expect(unlockedIds).toContain("first_rep");
    expect(unlockedIds).toContain("perfect_form");
    expect(unlockedIds).toContain("century_club");
    expect(unlockedIds).toContain("full_body");
  });
});
