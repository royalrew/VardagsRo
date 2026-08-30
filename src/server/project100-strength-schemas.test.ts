import { describe, expect, it } from "vitest";

import { project100ExerciseMuscleGroupsSchema } from "@/server/project100-strength-schemas";

describe("Projekt 100 muscle group input", () => {
  it("accepts several groups and removes duplicate selections", () => {
    expect(
      project100ExerciseMuscleGroupsSchema.parse({
        muscleGroups: ["chest", "triceps", "chest"],
      }),
    ).toEqual({ muscleGroups: ["chest", "triceps"] });
  });

  it("allows an empty selection so a wrong classification can be cleared", () => {
    expect(project100ExerciseMuscleGroupsSchema.parse({ muscleGroups: [] })).toEqual({
      muscleGroups: [],
    });
  });

  it("rejects invented groups and extra fields", () => {
    expect(() =>
      project100ExerciseMuscleGroupsSchema.parse({ muscleGroups: ["legs"] }),
    ).toThrow();
    expect(() =>
      project100ExerciseMuscleGroupsSchema.parse({ muscleGroups: ["back"], userId: "other" }),
    ).toThrow();
  });
});
