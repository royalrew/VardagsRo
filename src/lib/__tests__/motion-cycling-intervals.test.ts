import { describe, expect, it } from "vitest";

import {
  advanceCyclingIntervalSession,
  createCyclingIntervalSession,
  CYCLING_INTERVAL_30_PLAN,
  formatIntervalTime,
  getResistanceBadgeColors,
  skipToNextCyclingInterval,
} from "../motion-cycling-intervals";

describe("Cycling Intervals 30 Min Plan & Engine", () => {
  it("has a total duration of exactly 1800 seconds (30 minutes)", () => {
    expect(CYCLING_INTERVAL_30_PLAN.totalDurationSeconds).toBe(1800);
    const sumDuration = CYCLING_INTERVAL_30_PLAN.steps.reduce(
      (sum, step) => sum + step.durationSeconds,
      0,
    );
    expect(sumDuration).toBe(1800);
  });

  it("has contiguous steps with no gaps and matching start/end bounds", () => {
    let currentSecond = 0;
    for (let i = 0; i < CYCLING_INTERVAL_30_PLAN.steps.length; i++) {
      const step = CYCLING_INTERVAL_30_PLAN.steps[i];
      expect(step.stepNumber).toBe(i + 1);
      expect(step.totalSteps).toBe(CYCLING_INTERVAL_30_PLAN.steps.length);
      expect(step.startSecond).toBe(currentSecond);
      expect(step.endSecond).toBe(currentSecond + step.durationSeconds);
      currentSecond = step.endSecond;
    }
    expect(currentSecond).toBe(1800);
  });

  it("covers all 3 resistance levels: light, medium, heavy", () => {
    const resistances = new Set(CYCLING_INTERVAL_30_PLAN.steps.map((s) => s.resistance));
    expect(resistances.has("light")).toBe(true);
    expect(resistances.has("medium")).toBe(true);
    expect(resistances.has("heavy")).toBe(true);
  });

  it("advances session correctly through phases", () => {
    let session = createCyclingIntervalSession();
    expect(session.elapsedSeconds).toBe(0);
    expect(session.currentStepIndex).toBe(0);
    expect(session.currentStep.id).toBe("warmup-easy");
    expect(session.currentStep.resistance).toBe("light");
    expect(session.stepRemainingSeconds).toBe(180);

    // Advance 100 seconds (still in step 1)
    session = advanceCyclingIntervalSession(session, 100);
    expect(session.elapsedSeconds).toBe(100);
    expect(session.currentStepIndex).toBe(0);
    expect(session.stepRemainingSeconds).toBe(80);
    expect(session.progressPercent).toBe(6);

    // Advance into step 2 (warmup-tempo at 180s)
    session = advanceCyclingIntervalSession(session, 85);
    expect(session.elapsedSeconds).toBe(185);
    expect(session.currentStepIndex).toBe(1);
    expect(session.currentStep.id).toBe("warmup-tempo");
    expect(session.currentStep.resistance).toBe("medium");

    // Advance into step 5 (climb-1 at 540s / 9 min)
    session = advanceCyclingIntervalSession(session, 360);
    expect(session.currentStep.phaseType).toBe("climb");
    expect(session.currentStep.resistance).toBe("heavy");
    expect(session.currentStep.resistanceLabel).toBe("Tungt / Trögt");
  });

  it("handles skipping to the next interval", () => {
    let session = createCyclingIntervalSession();
    expect(session.currentStepIndex).toBe(0);

    session = skipToNextCyclingInterval(session);
    expect(session.currentStepIndex).toBe(1);
    expect(session.elapsedSeconds).toBe(180);
    expect(session.currentStep.id).toBe("warmup-tempo");

    session = skipToNextCyclingInterval(session);
    expect(session.currentStepIndex).toBe(2);
    expect(session.currentStep.id).toBe("tempo-1");
  });

  it("completes when reaching or exceeding 1800s", () => {
    let session = createCyclingIntervalSession();
    session = advanceCyclingIntervalSession(session, 1800);
    expect(session.isCompleted).toBe(true);
    expect(session.progressPercent).toBe(100);
    expect(session.stepRemainingSeconds).toBe(0);
    expect(session.estimatedCalories).toBeGreaterThan(150);
  });

  it("does not advance when paused", () => {
    let session = createCyclingIntervalSession();
    session.isPaused = true;
    session = advanceCyclingIntervalSession(session, 60);
    expect(session.elapsedSeconds).toBe(0);
  });

  it("formats time and provides distinct badge colors for all resistance levels", () => {
    expect(formatIntervalTime(0)).toBe("0:00");
    expect(formatIntervalTime(65)).toBe("1:05");
    expect(formatIntervalTime(600)).toBe("10:00");
    expect(formatIntervalTime(1800)).toBe("30:00");

    const light = getResistanceBadgeColors("light");
    const medium = getResistanceBadgeColors("medium");
    const heavy = getResistanceBadgeColors("heavy");

    expect(light.border).toBe("#10b981");
    expect(medium.border).toBe("#f59e0b");
    expect(heavy.border).toBe("#ef4444");
  });
});
