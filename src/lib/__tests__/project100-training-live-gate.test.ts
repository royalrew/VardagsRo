import { describe, expect, it } from "vitest";

import {
  assessProject100TrainingLiveGate,
  type Project100LiveGateAttemptInput,
} from "@/lib/project100-training-live-gate";

function attempt(
  missionType: "upper" | "lower",
  overrides: Partial<Project100LiveGateAttemptInput> = {},
): Project100LiveGateAttemptInput {
  return {
    id: `${missionType}-1`,
    missionType,
    status: "completed",
    sessionDate: "2026-09-08",
    coveragePercentage: 100,
    blocks: [
      { id: "b1", environment: "home", source: "manual" },
      { id: "b2", environment: "outdoor_gym", source: "motion" },
      { id: "b3", environment: "home", source: "jarvis" },
    ],
    ...overrides,
  };
}

describe("Projekt 100 K8 live gate", () => {
  it("stays pending without real mission evidence", () => {
    const result = assessProject100TrainingLiveGate([]);
    expect(result.passed).toBe(false);
    expect(result.passedMissionCount).toBe(0);
    expect(result.missions.upper.attemptId).toBeNull();
  });

  it("passes one completed mission with full coverage, three blocks and two environments", () => {
    const result = assessProject100TrainingLiveGate([attempt("upper")]);
    expect(result.missions.upper.passed).toBe(true);
    expect(result.missions.upper.environments).toEqual(["home", "outdoor_gym"]);
    expect(result.passed).toBe(false);
  });

  it("does not treat an honestly finished partial mission as a completed live gate", () => {
    const result = assessProject100TrainingLiveGate([
      attempt("upper", { coveragePercentage: 75 }),
    ]);
    expect(result.missions.upper.passed).toBe(false);
    expect(result.missions.upper.checks.find((check) => check.id === "coverage")).toMatchObject({
      passed: false,
      actual: "75%",
    });
  });

  it("requires distinct environments rather than three labels for the same place", () => {
    const result = assessProject100TrainingLiveGate([
      attempt("lower", {
        blocks: [
          { id: "b1", environment: "grass", source: "manual" },
          { id: "b2", environment: "grass", source: "manual" },
          { id: "b3", environment: "grass", source: "manual" },
        ],
      }),
    ]);
    expect(result.missions.lower.passed).toBe(false);
    expect(result.missions.lower.environments).toEqual(["grass"]);
  });

  it("uses the strongest auditable attempt instead of blindly choosing the newest", () => {
    const result = assessProject100TrainingLiveGate([
      attempt("upper", { id: "strong", sessionDate: "2026-09-01" }),
      attempt("upper", { id: "new-partial", sessionDate: "2026-09-08", coveragePercentage: 25, blocks: [] }),
    ]);
    expect(result.missions.upper.attemptId).toBe("strong");
    expect(result.missions.upper.passed).toBe(true);
  });

  it("passes K8 only when both mission types independently pass", () => {
    const result = assessProject100TrainingLiveGate([attempt("upper"), attempt("lower")]);
    expect(result.passed).toBe(true);
    expect(result.passedMissionCount).toBe(2);
  });
});
