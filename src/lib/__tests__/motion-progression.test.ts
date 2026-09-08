import { describe, expect, it } from "vitest";

import {
  createExerciseBaseline,
  recordSessionPerformance,
  recommendGoalAwareProgression,
  simulateMultiWeekProgression,
  type SessionPerformance,
} from "../motion-progression";

describe("Progression Motor (Steg 78)", () => {
  it("creates initial exercise baseline with sensible working volume", () => {
    const squatBase = createExerciseBaseline("squat", 10);
    expect(squatBase.exercise).toBe("squat");
    expect(squatBase.currentWorkingReps).toBe(10);
    expect(squatBase.targetSets).toBe(3);
    expect(squatBase.level).toBe(1);
    expect(squatBase.history.length).toBe(0);
  });

  it("does NOT advance progression on a single session, preventing outlier jumps", () => {
    let baseline = createExerciseBaseline("pushup", 8);

    // One session with easy RPE and 100% form
    const session1: SessionPerformance = {
      completedAt: "2026-09-01T10:00:00Z",
      completedReps: 8,
      targetReps: 8,
      rpe: "easy",
      formScorePercent: 95,
    };

    baseline = recordSessionPerformance(baseline, session1);
    expect(baseline.currentWorkingReps).toBe(8); // Still 8! Needs consecutive consistency
    expect(baseline.level).toBe(1);
  });

  it("advances progression when two consecutive sessions exhibit strong form and low/moderate RPE", () => {
    let baseline = createExerciseBaseline("squat", 10);

    const session1: SessionPerformance = {
      completedAt: "2026-09-01T10:00:00Z",
      completedReps: 10,
      targetReps: 10,
      rpe: "easy",
      formScorePercent: 92,
    };
    const session2: SessionPerformance = {
      completedAt: "2026-09-03T10:00:00Z",
      completedReps: 10,
      targetReps: 10,
      rpe: "moderate",
      formScorePercent: 90,
    };

    baseline = recordSessionPerformance(baseline, session1);
    baseline = recordSessionPerformance(baseline, session2);

    expect(baseline.currentWorkingReps).toBe(11); // +1 rep progression
    expect(baseline.level).toBe(2);
  });

  it("holds or deloads if form breaks down or RPE is consistently hard", () => {
    let baseline = createExerciseBaseline("lunge", 12);

    const hardSession1: SessionPerformance = {
      completedAt: "2026-09-01T10:00:00Z",
      completedReps: 10,
      targetReps: 12,
      rpe: "hard",
      formScorePercent: 68,
    };
    const hardSession2: SessionPerformance = {
      completedAt: "2026-09-03T10:00:00Z",
      completedReps: 9,
      targetReps: 12,
      rpe: "hard",
      formScorePercent: 70,
    };

    baseline = recordSessionPerformance(baseline, hardSession1);
    baseline = recordSessionPerformance(baseline, hardSession2);

    expect(baseline.currentWorkingReps).toBeLessThanOrEqual(12);
  });

  it("simulates a 6-week progressive overload trajectory safely", () => {
    const startingBase = createExerciseBaseline("pushup", 8);

    // Simulate 3 workouts per week for 6 weeks (18 workouts) with good adherence
    const result = simulateMultiWeekProgression(startingBase, 6, "steady-progress");

    expect(result.finalBaseline.currentWorkingReps).toBeGreaterThanOrEqual(12);
    expect(result.finalBaseline.currentWorkingReps).toBeLessThanOrEqual(20); // Reasonable physiological cap
    expect(result.history.length).toBe(18);
  });
});

describe("goal-aware exercise progression", () => {
  const easyHistory: SessionPerformance[] = [
    { completedAt: "2026-09-01T10:00:00Z", completedReps: 15, targetReps: 15, rpe: "easy", formScorePercent: 92 },
    { completedAt: "2026-09-04T10:00:00Z", completedReps: 15, targetReps: 15, rpe: "moderate", formScorePercent: 90 },
  ];

  it("requires two stable top-range sessions", () => {
    const result = recommendGoalAwareProgression({
      exerciseFamilyId: "squat",
      currentVariationId: "squat",
      goal: "hypertrophy",
      history: easyHistory.slice(0, 1),
      stableRangeOfMotion: true,
    });
    expect(result.action).toBe("hold");
  });

  it("prefers a safe, measurable backpack load over pistol squats for hypertrophy", () => {
    const result = recommendGoalAwareProgression({
      exerciseFamilyId: "squat",
      currentVariationId: "squat",
      goal: "hypertrophy",
      history: easyHistory,
      stableRangeOfMotion: true,
      availableEquipment: ["loaded_backpack"],
      backpack: {
        load: { waterLiters: 4, bagWeightKg: 0.7 },
        carryPosition: "back",
        safety: { contentsSecured: true, closuresClosed: true, seamsAndStrapsIntact: true, canReleaseSafely: true },
      },
    });
    expect(result.action).toBe("add_load");
    expect(result.nextVariationId).toBe("loaded-backpack-squat");
    expect(result.currentExternalLoadKg).toBe(4.7);
    expect(result.suggestedLoadIncreaseKg).toEqual([1, 2]);
  });

  it("routes skill progression through unilateral prerequisites", () => {
    const beforePrerequisites = recommendGoalAwareProgression({
      exerciseFamilyId: "squat",
      currentVariationId: "squat",
      goal: "strength_skill",
      history: easyHistory,
      stableRangeOfMotion: true,
      singleLegPrerequisitesMet: false,
    });
    expect(beforePrerequisites.nextVariationId).toBe("bulgarian-split-squat");

    const ready = recommendGoalAwareProgression({
      exerciseFamilyId: "squat",
      currentVariationId: "squat",
      goal: "strength_skill",
      history: easyHistory,
      stableRangeOfMotion: true,
      singleLegPrerequisitesMet: true,
    });
    expect(ready.nextVariationId).toBe("assisted-pistol-to-box");
  });

  it("does not advance to a free pistol while balance limits the set", () => {
    const result = recommendGoalAwareProgression({
      exerciseFamilyId: "squat",
      currentVariationId: "counterweighted-pistol",
      goal: "strength_skill",
      history: easyHistory,
      stableRangeOfMotion: true,
      balanceLimited: true,
      singleLegPrerequisitesMet: true,
    });
    expect(result.action).toBe("hold");
    expect(result.nextVariationId).not.toBe("free-pistol");
  });
});
