import { describe, expect, it } from "vitest";

import {
  buildProject100MetricSeries,
  buildProject100Milestones,
  project100MetricLabel,
  type Project100BodyEntry,
  type Project100WeightPoint,
} from "@/lib/project100-body";

function weights(...points: Array<[string, number]>): Project100WeightPoint[] {
  return points.map(([measuredOn, value]) => ({ measuredOn, value }));
}

function entry(
  measuredOn: string,
  measurements: Array<[string, number, "kg" | "cm"]>,
): Project100BodyEntry {
  return {
    measuredOn,
    note: null,
    measurements: measurements.map(([metric, value, unit]) => ({
      metric,
      label: project100MetricLabel(metric, null),
      unit,
      value,
    })),
  };
}

describe("Projekt 100 milestones", () => {
  it("puts rungs between the start and the goal, ending on the goal", () => {
    const milestones = buildProject100Milestones([], {
      weightGoalKg: 100,
      startWeightKg: 80,
      heightCm: null,
    });

    expect(milestones.map((milestone) => milestone.weightKg)).toEqual([
      82.5, 85, 87.5, 90, 92.5, 95, 97.5, 100,
    ]);
  });

  it("counts down just as willingly as it counts up", () => {
    const milestones = buildProject100Milestones([], {
      weightGoalKg: 80,
      startWeightKg: 100,
      heightCm: null,
    });

    expect(milestones[0].weightKg).toBe(97.5);
    expect(milestones.at(-1)?.weightKg).toBe(80);
  });

  it("widens the step rather than listing thirty rungs", () => {
    const milestones = buildProject100Milestones([], {
      weightGoalKg: 140,
      startWeightKg: 80,
      heightCm: null,
    });

    expect(milestones.length).toBeLessThanOrEqual(9);
    expect(milestones.at(-1)?.weightKg).toBe(140);
  });

  it("marks a rung on the first day it was passed", () => {
    const milestones = buildProject100Milestones(
      weights(["2026-01-04", 80.2], ["2026-03-01", 82.9], ["2026-04-01", 83.4]),
      { weightGoalKg: 100, startWeightKg: 80, heightCm: null },
    );

    expect(milestones[0]).toEqual({ weightKg: 82.5, reachedOn: "2026-03-01" });
    expect(milestones[1]).toEqual({ weightKg: 85, reachedOn: null });
  });

  it("keeps a rung marked even after the weight fell back", () => {
    // The road was walked. A bad week does not undo it.
    const milestones = buildProject100Milestones(
      weights(["2026-03-01", 85.4], ["2026-04-01", 83.0]),
      { weightGoalKg: 100, startWeightKg: 80, heightCm: null },
    );

    expect(milestones[1]).toEqual({ weightKg: 85, reachedOn: "2026-03-01" });
  });

  it("falls back to the first logged weight when no start was set", () => {
    const milestones = buildProject100Milestones(weights(["2026-01-04", 80]), {
      weightGoalKg: 90,
      startWeightKg: null,
      heightCm: null,
    });

    expect(milestones[0].weightKg).toBe(82.5);
  });

  it("says nothing at all rather than inventing a direction", () => {
    expect(
      buildProject100Milestones(weights(["2026-01-04", 80]), {
        weightGoalKg: null,
        startWeightKg: 80,
        heightCm: null,
      }),
    ).toEqual([]);
    expect(
      buildProject100Milestones([], { weightGoalKg: 90, startWeightKg: null, heightCm: null }),
    ).toEqual([]);
    expect(
      buildProject100Milestones([], { weightGoalKg: 90, startWeightKg: 90.2, heightCm: null }),
    ).toEqual([]);
  });
});

describe("Projekt 100 measurement series", () => {
  it("turns logged days into one oldest-first line per measured thing", () => {
    const series = buildProject100MetricSeries([
      entry("2026-03-01", [["weight", 83, "kg"], ["waist", 88, "cm"]]),
      entry("2026-01-04", [["weight", 80, "kg"]]),
    ]);

    expect(series.map((item) => item.metric)).toEqual(["weight", "waist"]);
    expect(series[0].points).toEqual([
      { measuredOn: "2026-01-04", value: 80 },
      { measuredOn: "2026-03-01", value: 83 },
    ]);
    expect(series[1].points).toHaveLength(1);
  });

  it("keeps the known measurements in a fixed order and puts own ones last", () => {
    const series = buildProject100MetricSeries([
      entry("2026-03-01", [
        ["underarm", 31, "cm"],
        ["waist", 88, "cm"],
        ["weight", 83, "kg"],
      ]),
    ]);

    expect(series.map((item) => item.metric)).toEqual(["weight", "waist", "underarm"]);
  });

  it("returns nothing for a period with nothing measured in it", () => {
    expect(buildProject100MetricSeries([])).toEqual([]);
    expect(buildProject100MetricSeries([entry("2026-03-01", [])])).toEqual([]);
  });
});
