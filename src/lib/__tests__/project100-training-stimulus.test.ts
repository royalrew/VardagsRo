import { describe, expect, it } from "vitest";

import { assessProject100TrainingStimulus, type Project100StimulusSetInput } from "../project100-training-stimulus";

function set(overrides: Partial<Project100StimulusSetInput> = {}): Project100StimulusSetInput {
  return {
    movementPattern: "horizontal_push",
    purpose: "strength_hypertrophy",
    reps: 10,
    weightKg: null,
    durationSeconds: null,
    rpe: 8,
    observationLevel: "rep_counting",
    romConfidence: 0.75,
    ...overrides,
  };
}

describe("Projekt 100 training stimulus", () => {
  it("refuses to assess when effort is missing", () => {
    const result = assessProject100TrainingStimulus({
      missionType: "upper",
      sets: [set({ rpe: null }), set({ rpe: null })],
    });
    expect(result.areas[0].level).toBe("not_assessable");
    expect(result.areas[0].evidence.dataGaps).toContain("RPE saknas för ett eller flera set.");
  });

  it("does not hide a missing RPE behind another complete set", () => {
    const result = assessProject100TrainingStimulus({
      missionType: "upper",
      sets: [set(), set({ rpe: null })],
    });
    expect(result.areas[0].level).toBe("not_assessable");
  });

  it("refuses to invent ROM confidence from rep counting alone", () => {
    const result = assessProject100TrainingStimulus({
      missionType: "upper",
      sets: [set({ romConfidence: null }), set({ romConfidence: null })],
    });
    expect(result.areas[0].level).toBe("not_assessable");
  });

  it("recognizes several hard sets with usable ROM evidence", () => {
    const result = assessProject100TrainingStimulus({
      missionType: "upper",
      sets: [set(), set({ reps: 12, rpe: 8.5 })],
      priorWeeklySets: { horizontal_push: 3 },
    });
    expect(result.areas[0]).toMatchObject({
      level: "likely_sufficient",
      evidence: { relevantSets: 2, priorWeeklySets: 3, weeklySetsIncludingToday: 5 },
    });
    expect(result.areas[0].evidence.estimatedRir).toBe(1.7);
  });

  it("warns that more is not automatically better at high volume", () => {
    const result = assessProject100TrainingStimulus({
      missionType: "lower",
      sets: [set({ movementPattern: "knee_dominant" }), set({ movementPattern: "knee_dominant" })],
      priorWeeklySets: { knee_dominant: 12 },
    });
    expect(result.areas[0].level).toBe("high_load");
    expect(result.level).toBe("high_load");
  });

  it("does not credit skill work as hypertrophy stimulus", () => {
    const result = assessProject100TrainingStimulus({
      missionType: "upper",
      sets: [set({ movementPattern: "vertical_push", purpose: "skill" })],
    });
    expect(result.level).toBe("not_assessable");
    expect(result.areas.every((area) => area.evidence.relevantSets === 0)).toBe(true);
  });
});
