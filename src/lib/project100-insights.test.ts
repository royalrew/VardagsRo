import { describe, expect, it } from "vitest";

import {
  averageOf,
  computeMetricDelta,
  dateDiffDays,
  generateInsightHighlights,
  resolveInsightPeriodDates,
  type Project100BodyInsights,
  type Project100NutritionInsights,
  type Project100RecoveryInsights,
  type Project100TrainingInsights,
  type Project100WorkComparison,
} from "./project100-insights";

describe("project100-insights domain helpers", () => {
  it("computes metric deltas correctly with absolute and percentage change", () => {
    const delta1 = computeMetricDelta(85.5, 82.0);
    expect(delta1.current).toBe(85.5);
    expect(delta1.previous).toBe(82.0);
    expect(delta1.change).toBe(3.5);
    expect(delta1.changePercent).toBe(4.3);

    const delta2 = computeMetricDelta(10, 20);
    expect(delta2.change).toBe(-10);
    expect(delta2.changePercent).toBe(-50);

    const deltaNull = computeMetricDelta(null, null);
    expect(deltaNull.change).toBeNull();
    expect(deltaNull.changePercent).toBeNull();
  });

  it("resolves period dates for standard presets (30d, 90d, 180d, year)", () => {
    const period30 = resolveInsightPeriodDates("30d", null, null, "2026-08-30");
    expect(period30.to).toBe("2026-08-30");
    expect(period30.from).toBe("2026-08-01");
    expect(period30.compareTo).toBe("2026-07-31");
    expect(period30.compareFrom).toBe("2026-07-02");

    const period90 = resolveInsightPeriodDates("90d", null, null, "2026-08-30");
    expect(period90.to).toBe("2026-08-30");
    expect(dateDiffDays(period90.from, period90.to)).toBe(89);
    expect(dateDiffDays(period90.compareFrom, period90.compareTo)).toBe(89);
  });

  it("resolves custom period dates properly", () => {
    const custom = resolveInsightPeriodDates(
      "custom",
      "2026-06-01",
      "2026-06-15",
      "2026-08-30",
    );
    expect(custom.from).toBe("2026-06-01");
    expect(custom.to).toBe("2026-06-15");
    expect(custom.compareTo).toBe("2026-05-31");
    expect(custom.compareFrom).toBe("2026-05-17");
  });

  it("computes mathematical averages correctly", () => {
    expect(averageOf([])).toBeNull();
    expect(averageOf([10, 20, 30])).toBe(20);
    expect(averageOf([7.5, 8.0, 7.0])).toBe(7.5);
  });

  it("generates structured and traceable highlights", () => {
    const body: Project100BodyInsights = {
      startWeightKg: 82.0,
      endWeightKg: 85.5,
      minWeightKg: 81.8,
      maxWeightKg: 85.7,
      weightDelta: computeMetricDelta(85.5, 82.0),
      measurementCount: 12,
      metricChanges: [],
    };
    const training: Project100TrainingInsights = {
      completedSessions: computeMetricDelta(16, 12),
      totalMinutes: computeMetricDelta(720, 540),
      totalVolumeKg: computeMetricDelta(45000, 38000),
      activityBreakdown: [{ activityType: "gym", label: "Styrketräning", count: 16, minutes: 720 }],
      personalBestsCount: 3,
      muscleGroupSets: [],
      uncategorizedSets: 0,
    };
    const nutrition: Project100NutritionInsights = {
      averageProteinG: computeMetricDelta(185, 170),
      averageKcal: computeMetricDelta(2800, 2600),
      proteinTargetHitDays: 20,
      loggedDaysCount: 25,
      proteinTargetCoverageRate: 0.8,
      totalMealsLogged: 75,
      batchesCooked: 4,
    };
    const recovery: Project100RecoveryInsights = {
      averageSleepHours: computeMetricDelta(7.5, 7.0),
      averageEnergy: computeMetricDelta(4.0, 3.5),
      averageMood: computeMetricDelta(4.2, 3.8),
      loggedDaysCount: 22,
    };
    const workComparison: Project100WorkComparison = {
      workDaysCount: 15,
      offDaysCount: 15,
      workHoursTotal: 120,
      sessionsOnWorkDays: 6,
      sessionsOnWorkDaysRate: 0.4,
      sessionsOnOffDays: 10,
      sessionsOnOffDaysRate: 0.67,
      averageSleepOnWorkDays: 7.0,
      averageSleepOnOffDays: 8.0,
      averageEnergyOnWorkDays: 3.8,
      averageEnergyOnOffDays: 4.2,
    };

    const highlights = generateInsightHighlights(
      body,
      training,
      nutrition,
      recovery,
      workComparison,
    );

    expect(highlights.length).toBeGreaterThanOrEqual(4);
    expect(highlights.some((h) => h.title.includes("ökat med 3,5 kg"))).toBe(true);
    expect(highlights.some((h) => h.title.includes("16 pass genomförda"))).toBe(true);
    expect(highlights.some((h) => h.title.includes("Snittprotein 185 g"))).toBe(true);
  });
});
