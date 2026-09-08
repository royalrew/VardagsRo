import { describe, expect, it } from "vitest";

import {
  buildMotionMissionLaunchHref,
  buildMotionMissionBlockInput,
  parseMotionMissionLaunch,
} from "../motion-mission-launch";
import { project100TrainingBlockAppendSchema } from "@/server/project100-training-schemas";

describe("Motion mission launch", () => {
  it("round-trips a supported Core 24 variation without trusting display metadata", () => {
    const href = buildMotionMissionLaunchHref({
      missionId: "mission-1",
      familyId: "squat",
      variationId: "squat",
      exerciseId: "squat",
      exerciseName: "ignored when parsing",
      movementPattern: "knee_dominant",
      environment: "grass",
      targetReps: 12,
      targetDurationSeconds: null,
      weightKg: null,
      backpackCarryPosition: null,
    });
    const query = Object.fromEntries(new URL(href, "https://zickaris.local").searchParams.entries());
    expect(parseMotionMissionLaunch(query)).toMatchObject({
      exerciseId: "squat",
      exerciseName: "Knäböj",
      movementPattern: "knee_dominant",
      weightKg: null,
    });
  });

  it("rejects unsupported families and variations", () => {
    expect(parseMotionMissionLaunch({
      mission: "mission-1",
      family: "parallel-bar-dips",
      variation: "parallel-bar-dips",
      environment: "gym",
      targetReps: "10",
    })).toBeNull();
    expect(parseMotionMissionLaunch({
      mission: "mission-1",
      family: "squat",
      variation: "loaded-backpack-squat",
      environment: "home",
      targetReps: "10",
    })).toBeNull();
    expect(parseMotionMissionLaunch({
      mission: "mission-1",
      family: "squat",
      variation: "invented-squat",
      environment: "home",
      targetReps: "10",
    })).toBeNull();
  });

  it("builds an idempotent one-set Motion block with observation level", () => {
    const launch = parseMotionMissionLaunch({
      mission: "mission-1",
      family: "pushup",
      variation: "pushup",
      environment: "home",
      targetReps: "10",
    });
    expect(launch).not.toBeNull();
    const block = buildMotionMissionBlockInput(launch!, {
      reps: 11,
      holdSeconds: 0,
      rpe: 8,
      startedAt: "2026-09-08T10:00:00.000Z",
      endedAt: "2026-09-08T10:00:40.000Z",
      sourceEventId: "motion-set-stable-1",
      setupProfileId: "camera-setup-1",
      observationLevel: "rep_counting",
      romConfidence: 0.78,
    });
    expect(block).toMatchObject({
      source: "motion",
      sourceEventId: "motion-set-stable-1",
      activeSeconds: 40,
      setupProfileId: "camera-setup-1",
      exercises: [{
        movementPattern: "horizontal_push",
        sets: [{ reps: 11, sourceEventId: "motion-set-stable-1", observationLevel: "rep_counting", romConfidence: 0.78 }],
      }],
    });
    expect(project100TrainingBlockAppendSchema.safeParse(block).success).toBe(true);
  });
});
