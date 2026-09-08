import { describe, expect, it } from "vitest";

import {
  calculateProject100MissionCoverage,
  classifyProject100MissionExercise,
  PROJECT100_DAILY_MISSION_TEMPLATES,
  recommendProject100MissionExercises,
} from "@/lib/project100-training-mission";

describe("daily training mission templates", () => {
  it("offers deterministic alternatives across multiple environments", () => {
    const upper = PROJECT100_DAILY_MISSION_TEMPLATES.upper;
    const lower = PROJECT100_DAILY_MISSION_TEMPLATES.lower;

    expect(upper.requirements.map((item) => item.movementPattern)).toEqual([
      "horizontal_push",
      "horizontal_pull",
      "vertical_push",
      "vertical_pull",
    ]);
    expect(lower.requirements.map((item) => item.movementPattern)).toEqual([
      "knee_dominant",
      "hip_dominant",
      "unilateral_lower",
      "calf_ankle",
    ]);
    expect(
      upper.requirements.flatMap((item) => item.alternatives).some((item) =>
        item.environments.includes("outdoor_gym"),
      ),
    ).toBe(true);
    expect(
      upper.requirements.flatMap((item) => item.alternatives).some((item) =>
        item.environments.includes("home"),
      ),
    ).toBe(true);
  });

  it("counts completed strength sets by movement pattern and caps extra sets", () => {
    const result = calculateProject100MissionCoverage("upper", [
      { movementPattern: "horizontal_push", purpose: "strength_hypertrophy", completedSets: 5 },
      { movementPattern: "horizontal_pull", purpose: "strength_hypertrophy", completedSets: 3 },
      { movementPattern: "vertical_push", purpose: "strength_hypertrophy", completedSets: 2 },
    ]);

    expect(result.percentage).toBe(67);
    expect(result.completedTargetSets).toBe(8);
    expect(result.targetSets).toBe(12);
    expect(result.requirements.find((item) => item.movementPattern === "vertical_pull"))
      .toMatchObject({ completedSets: 0, remainingSets: 3 });
  });

  it("keeps handstand skill work visible without using it as hypertrophy coverage", () => {
    const result = calculateProject100MissionCoverage("upper", [
      { movementPattern: "vertical_push", purpose: "skill", completedSets: 3 },
    ]);

    expect(result.percentage).toBe(0);
    expect(result.requirements.find((item) => item.movementPattern === "vertical_push"))
      .toMatchObject({ completedSets: 0, remainingSets: 3 });
  });

  it("reaches one hundred only when every required slot is covered", () => {
    const completed = PROJECT100_DAILY_MISSION_TEMPLATES.lower.requirements.map((requirement) => ({
      movementPattern: requirement.movementPattern,
      purpose: "strength_hypertrophy" as const,
      completedSets: requirement.targetSets,
    }));

    expect(calculateProject100MissionCoverage("lower", completed).percentage).toBe(100);
  });

  it("classifies known reports without guessing unknown exercises", () => {
    expect(classifyProject100MissionExercise("Armhävningar")).toEqual({
      movementPattern: "horizontal_push",
      purpose: "strength_hypertrophy",
    });
    expect(classifyProject100MissionExercise("Handstående")).toEqual({
      movementPattern: "vertical_push",
      purpose: "skill",
    });
    expect(classifyProject100MissionExercise("Min egen specialövning")).toBeNull();
  });

  it("fills mission slots from Core 24 using the current environment and equipment", () => {
    const home = recommendProject100MissionExercises({
      missionType: "lower",
      environment: "home",
      availableEquipment: ["loaded_backpack", "bench_or_chair"],
      backpackCarryPosition: "back",
    });
    const kneeDominant = home.find((item) => item.movementPattern === "knee_dominant");
    expect(kneeDominant?.recommendations.some((item) => item.familyId === "squat")).toBe(true);
    expect(
      kneeDominant?.recommendations
        .flatMap((item) => item.availableVariations)
        .some((variation) => variation.id === "loaded-backpack-squat"),
    ).toBe(true);

    const grassNoGear = recommendProject100MissionExercises({
      missionType: "upper",
      environment: "grass",
    });
    expect(grassNoGear.find((item) => item.movementPattern === "horizontal_push")?.recommendations[0]?.familyId)
      .toBe("pushup");
    expect(grassNoGear.find((item) => item.movementPattern === "horizontal_pull")?.recommendations)
      .toHaveLength(0);
  });

  it("filters loaded variations by the confirmed backpack carry position", () => {
    const withGobletHold = recommendProject100MissionExercises({
      missionType: "lower",
      environment: "home",
      availableEquipment: ["loaded_backpack", "bench_or_chair"],
      backpackCarryPosition: "goblet_hold",
    });
    const loadedBulgarian = withGobletHold
      .find((item) => item.movementPattern === "unilateral_lower")
      ?.recommendations
      .flatMap((item) => item.availableVariations)
      .some((variation) => variation.id === "loaded-bulgarian");
    expect(loadedBulgarian).toBe(false);
  });
});
