import { describe, expect, it } from "vitest";
import {
  HANDSTAND_PROGRESSION_STEPS,
  buildHandstandWorkout,
  getHandstandStep,
} from "../project100-handstand-track";

describe("project100-handstand-track", () => {
  it("should have exactly 10 structured progression steps", () => {
    expect(HANDSTAND_PROGRESSION_STEPS).toHaveLength(10);
    expect(HANDSTAND_PROGRESSION_STEPS.map((s) => s.step)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("should have correct phases mapped to steps", () => {
    // Steps 1-4: grund
    expect(HANDSTAND_PROGRESSION_STEPS.slice(0, 4).every((s) => s.phase === "grund")).toBe(true);
    // Steps 5-7: vagg
    expect(HANDSTAND_PROGRESSION_STEPS.slice(4, 7).every((s) => s.phase === "vagg")).toBe(true);
    // Steps 8-10: balans
    expect(HANDSTAND_PROGRESSION_STEPS.slice(7, 10).every((s) => s.phase === "balans")).toBe(true);
  });

  it("should fallback gracefully if an unknown step is requested", () => {
    const invalid = getHandstandStep(99);
    expect(invalid.step).toBe(1);
    expect(invalid.title).toContain("Handledspreparering");
  });

  it("should build an introductory workout for Step 1", () => {
    const workout = buildHandstandWorkout(1);
    expect(workout.title).toBe("Handstående · Steg 1: Handledspreparering & Rörlighet");
    expect(workout.estimatedMinutes).toBe(15);
    expect(workout.exercises.length).toBeGreaterThanOrEqual(1);
    expect(workout.exercises[0].name).toContain("Handledspreparering");
    expect(workout.exercises[0].sets.length).toBe(2);
  });

  it("should include wrist preparation and core when building Step 3 or 4", () => {
    const workout = buildHandstandWorkout(3);
    expect(workout.title).toContain("Steg 3");
    // Should have: 1. Wrist prep, 2. Box pike hold, 3. Hollow body
    expect(workout.exercises.length).toBe(3);
    expect(workout.exercises[0].name).toContain("Handledspreparering");
    expect(workout.exercises[1].name).toContain("Box Pike Hold");
    expect(workout.exercises[2].name).toContain("Hollow Body");
  });

  it("should generate valid set drafts with reasonable numbers", () => {
    const workout = buildHandstandWorkout(4); // Pike Push-Ups (reps)
    const pikeExercise = workout.exercises.find((e) => e.name.includes("Pike Push-Ups"));
    expect(pikeExercise).toBeDefined();
    expect(pikeExercise?.sets[0].reps).toBe("8");
    expect(pikeExercise?.sets[0].rpe).toBe("7");
  });

  it("should link to Motion Lab exercise types where supported", () => {
    const plankStep = getHandstandStep(2);
    expect(plankStep.motionExerciseId).toBe("plank");

    const pikeStep = getHandstandStep(4);
    expect(pikeStep.motionExerciseId).toBe("pike-pushup");

    const wallStep = getHandstandStep(6);
    expect(wallStep.motionExerciseId).toBe("handstand-hold");
  });
});
