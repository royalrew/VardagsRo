import { describe, expect, it } from "vitest";
import {
  computeRetentionSummary,
  recordWorkoutSession,
  evaluatePerformanceBudget,
  type MotionWorkoutRecord,
} from "../motion-retention";

describe("motion-retention (Steg 85 & 86: Retention, Streaks, Coach-A/B & Performance Budget)", () => {
  it("calculates retention streaks and aggregates across consecutive days", () => {
    const day1 = new Date("2026-09-01T10:00:00Z");
    const day2 = new Date("2026-09-02T10:00:00Z");
    const day3 = new Date("2026-09-03T10:00:00Z");

    let history: MotionWorkoutRecord[] = [];

    const res1 = recordWorkoutSession(
      history,
      {
        exercise: "squat",
        totalReps: 30,
        durationSeconds: 180,
        formScore: 92,
        xpEarned: 150,
        coachMode: "living-coach",
      },
      day1,
    );
    history = res1.updatedHistory;
    expect(res1.summary.currentStreakDays).toBe(1);

    const res2 = recordWorkoutSession(
      history,
      {
        exercise: "pushup",
        totalReps: 25,
        durationSeconds: 150,
        formScore: 88,
        xpEarned: 120,
        coachMode: "living-coach",
      },
      day2,
    );
    history = res2.updatedHistory;
    expect(res2.summary.currentStreakDays).toBe(2);

    const res3 = recordWorkoutSession(
      history,
      {
        exercise: "circuit",
        totalReps: 60,
        durationSeconds: 600,
        formScore: 94,
        xpEarned: 350,
        coachMode: "living-coach",
      },
      day3,
    );
    history = res3.updatedHistory;
    expect(res3.summary.currentStreakDays).toBe(3);
    expect(res3.summary.longestStreakDays).toBe(3);
    expect(res3.summary.totalWorkouts).toBe(3);
    expect(res3.summary.totalReps).toBe(115);
  });

  it("resets current streak after skipping more than one calendar day", () => {
    const day1 = new Date("2026-09-01T10:00:00Z");
    const day4 = new Date("2026-09-05T10:00:00Z"); // 4 days gap

    let history: MotionWorkoutRecord[] = [];
    const res1 = recordWorkoutSession(
      history,
      {
        exercise: "squat",
        totalReps: 20,
        durationSeconds: 120,
        formScore: 85,
        xpEarned: 100,
        coachMode: "rep-counter",
      },
      day1,
    );

    const res2 = recordWorkoutSession(
      res1.updatedHistory,
      {
        exercise: "squat",
        totalReps: 25,
        durationSeconds: 140,
        formScore: 89,
        xpEarned: 120,
        coachMode: "living-coach",
      },
      day4,
    );

    expect(res2.summary.currentStreakDays).toBe(1);
    expect(res2.summary.longestStreakDays).toBe(1);
  });

  it("evaluates Coach A/B preference based on session usage and user ratings", () => {
    const history: MotionWorkoutRecord[] = [
      {
        id: "1",
        completedAt: "2026-09-01T10:00:00Z",
        exercise: "squat",
        totalReps: 30,
        durationSeconds: 200,
        formScore: 90,
        xpEarned: 150,
        coachMode: "living-coach",
      },
      {
        id: "2",
        completedAt: "2026-09-02T10:00:00Z",
        exercise: "lunge",
        totalReps: 20,
        durationSeconds: 180,
        formScore: 85,
        xpEarned: 120,
        coachMode: "living-coach",
      },
      {
        id: "3",
        completedAt: "2026-09-03T10:00:00Z",
        exercise: "plank",
        totalReps: 60,
        durationSeconds: 60,
        formScore: 80,
        xpEarned: 100,
        coachMode: "rep-counter",
      },
    ];

    const summary = computeRetentionSummary(history, new Date("2026-09-03T12:00:00Z"));
    expect(summary.coachPreference.livingCoachCount).toBe(2);
    expect(summary.coachPreference.repCounterCount).toBe(1);
    expect(summary.coachPreference.preferredMode).toBe("living-coach");
  });

  it("evaluates performance budget according to Gate requirements", () => {
    // Passes on HDMI TV setup
    const goodHdmi = evaluatePerformanceBudget({
      poseHz: 22.5,
      renderFps: 60,
      p95PipelineLatencyMs: 68,
      isHdmi: true,
    });
    expect(goodHdmi.passesAll).toBe(true);
    expect(goodHdmi.checks.pose).toBe(true);
    expect(goodHdmi.checks.render).toBe(true);
    expect(goodHdmi.checks.latency).toBe(true);
    expect(goodHdmi.recommendations).toHaveLength(0);

    // Fails latency and pose budget
    const slowSystem = evaluatePerformanceBudget({
      poseHz: 14.2,
      renderFps: 22,
      p95PipelineLatencyMs: 145,
      isHdmi: true,
    });
    expect(slowSystem.passesAll).toBe(false);
    expect(slowSystem.checks.pose).toBe(false);
    expect(slowSystem.checks.render).toBe(false);
    expect(slowSystem.checks.latency).toBe(false);
    expect(slowSystem.recommendations.length).toBeGreaterThan(0);
  });
});
