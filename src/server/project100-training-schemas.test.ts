import { describe, expect, it } from "vitest";

import {
  project100SessionCreateSchema,
  project100TemplateCreateSchema,
  project100TrainingIdSchema,
} from "@/server/project100-training-schemas";

function session(overrides: Record<string, unknown> = {}) {
  return {
    title: "Helkropp hemma",
    activityType: "strength_home",
    status: "completed",
    sessionDate: "2026-08-26",
    exercises: [{ name: "Marklyft", sets: [{ reps: 8, weightKg: 60 }] }],
    ...overrides,
  };
}

describe("Projekt 100 training contracts", () => {
  it("fills in the optional parts of a minimal session", () => {
    const parsed = project100SessionCreateSchema.parse(session());

    expect(parsed).toMatchObject({
      templateId: null,
      plannedStartAt: null,
      plannedEndAt: null,
      durationSeconds: null,
      location: null,
      effort: null,
      notes: null,
    });
    expect(parsed.exercises[0].sets[0]).toEqual({
      reps: 8,
      weightKg: 60,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
    });
  });

  it("rejects a status the workspace is not allowed to write directly", () => {
    expect(() => project100SessionCreateSchema.parse(session({ status: "in_progress" }))).toThrow();
    expect(() => project100SessionCreateSchema.parse(session({ status: "skipped" }))).toThrow();
  });

  it("refuses a set with nothing measured in it", () => {
    expect(() =>
      project100SessionCreateSchema.parse(
        session({ exercises: [{ name: "Marklyft", sets: [{}] }] }),
      ),
    ).toThrow(/minst ett värde/);
  });

  it("refuses a completed session that says nothing about what was done", () => {
    expect(() =>
      project100SessionCreateSchema.parse(session({ exercises: [], durationSeconds: null })),
    ).toThrow(/övningar eller en totaltid/);
    expect(() =>
      project100SessionCreateSchema.parse(session({ exercises: [], durationSeconds: 1_800 })),
    ).not.toThrow();
  });

  it("keeps a planned time window in the right order", () => {
    expect(() =>
      project100SessionCreateSchema.parse(
        session({ plannedStartAt: null, plannedEndAt: "2026-08-26T18:00:00.000Z" }),
      ),
    ).toThrow(/Starttid krävs/);
    expect(() =>
      project100SessionCreateSchema.parse(
        session({
          plannedStartAt: "2026-08-26T19:00:00.000Z",
          plannedEndAt: "2026-08-26T18:00:00.000Z",
        }),
      ),
    ).toThrow(/efter starttiden/);
  });

  it("refuses a date that does not exist", () => {
    expect(() => project100SessionCreateSchema.parse(session({ sessionDate: "2026-02-30" }))).toThrow(
      /Datumet finns inte/,
    );
    expect(() => project100SessionCreateSchema.parse(session({ sessionDate: "26-08-2026" }))).toThrow();
  });

  it("ignores nothing: unknown fields are an error, not silently dropped", () => {
    expect(() =>
      project100SessionCreateSchema.parse(session({ userId: "someone-else" })),
    ).toThrow();
    expect(() =>
      project100TemplateCreateSchema.parse({
        name: "30 min helkropp",
        activityType: "strength_home",
        exercises: [{ name: "Marklyft", sets: [{ reps: 12 }] }],
        archivedAt: null,
      }),
    ).toThrow();
  });

  it("caps a single session so one request cannot flood the log", () => {
    const hugeExercise = {
      name: "Marklyft",
      sets: Array.from({ length: 100 }, () => ({ reps: 5 })),
    };

    expect(() =>
      project100SessionCreateSchema.parse(
        session({ exercises: Array.from({ length: 6 }, () => hugeExercise) }),
      ),
    ).toThrow(/högst 500 set/);
  });

  it("requires at least one exercise in a reusable template", () => {
    expect(() =>
      project100TemplateCreateSchema.parse({
        name: "Tom mall",
        activityType: "running",
        exercises: [],
      }),
    ).toThrow();
  });

  it("only accepts ids that can be put in a route without escaping", () => {
    expect(project100TrainingIdSchema.parse("01JB4Z-abc_DEF")).toBe("01JB4Z-abc_DEF");
    for (const hostile of ["../templates", "a/b", "", "-leading-dash", "a b"]) {
      expect(() => project100TrainingIdSchema.parse(hostile), hostile).toThrow();
    }
  });
});
