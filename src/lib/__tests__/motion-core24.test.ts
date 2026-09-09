import { describe, expect, it } from "vitest";

import { CORE_24_FAMILIES, recommendCore24Families } from "../motion-core24";
import {
  estimateLoadedBackpackWeight,
  isLoadedBackpackCompatible,
  validateLoadedBackpackSetup,
} from "../motion-equipment";

describe("Core 24 exercise catalog", () => {
  it("contains exactly 24 curated families without dip variants", () => {
    expect(CORE_24_FAMILIES).toHaveLength(24);
    expect(new Set(CORE_24_FAMILIES.map((item) => item.id)).size).toBe(24);
    expect(CORE_24_FAMILIES.flatMap((item) => [item.id, ...item.variations.map((v) => v.id)]))
      .not.toEqual(expect.arrayContaining(["bench-dips", "parallel-bar-dips"]));
  });

  it("gives every family several variations and a bounded transparent utility profile", () => {
    for (const family of CORE_24_FAMILIES) {
      expect(family.variations.length).toBeGreaterThanOrEqual(3);
      for (const component of Object.values(family.utility)) {
        expect(component).toBeGreaterThanOrEqual(1);
        expect(component).toBeLessThanOrEqual(5);
      }
    }
  });

  it("keeps cardio modes even when they are not webcam-first", () => {
    const conditioningIds = CORE_24_FAMILIES
      .filter((item) => item.section === "conditioning")
      .map((item) => item.id);
    expect(conditioningIds).toEqual(["walk-run", "cycling", "bodyweight-intervals"]);
  });

  it("filters recommendations by real environment and equipment", () => {
    const homeNoGear = recommendCore24Families({ goal: "hypertrophy", environment: "home" });
    expect(homeNoGear.some((item) => item.family.id === "pushup")).toBe(true);
    expect(homeNoGear.some((item) => item.family.id === "one-arm-row")).toBe(false);

    const homeWithDumbbell = recommendCore24Families({
      goal: "hypertrophy",
      environment: "home",
      availableEquipment: ["dumbbell"],
    });
    expect(homeWithDumbbell.some((item) => item.family.id === "one-arm-row")).toBe(true);
    expect(homeWithDumbbell.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);

    const homeWithKettlebellAndChair = recommendCore24Families({
      goal: "hypertrophy",
      environment: "home",
      availableEquipment: ["kettlebell", "bench_or_chair"],
    });
    const row = homeWithKettlebellAndChair.find((item) => item.family.id === "one-arm-row");
    expect(row?.availableVariations.map((item) => item.id)).toContain("supported-one-arm-kettlebell-row");
  });
});

describe("loaded backpack model", () => {
  it("estimates water at 1 kg per litre and exposes uncertainty", () => {
    expect(estimateLoadedBackpackWeight({ waterLiters: 3, bagWeightKg: 0.8 })).toEqual({
      estimatedKg: 3.8,
      confidence: "estimated",
      breakdown: { waterKg: 3, bagKg: 0.8, additionalKg: 0 },
    });
    expect(estimateLoadedBackpackWeight({ waterLiters: 3, measuredTotalKg: 4.1 }).confidence).toBe("measured");
  });

  it("requires all four safety confirmations", () => {
    const result = validateLoadedBackpackSetup({
      contentsSecured: false,
      closuresClosed: true,
      seamsAndStrapsIntact: true,
      canReleaseSafely: true,
    });
    expect(result.safeToRecommend).toBe(false);
    expect(result.reasons).toHaveLength(1);
  });

  it("allows stable movements but rejects overhead, explosive and pistol use", () => {
    expect(isLoadedBackpackCompatible("squat", "back")).toBe(true);
    expect(isLoadedBackpackCompatible("bulgarian-split-squat", "front_hug")).toBe(true);
    expect(isLoadedBackpackCompatible("kettlebell-swing", "back")).toBe(false);
    expect(isLoadedBackpackCompatible("free-pistol", "back")).toBe(false);
    expect(isLoadedBackpackCompatible("overhead-press", "goblet_hold")).toBe(false);
  });
});
