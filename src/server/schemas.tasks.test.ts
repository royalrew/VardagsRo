import { describe, expect, it } from "vitest";

import {
  extractedTaskSchema,
  manualTaskSchema,
  taskCompletionSchema,
} from "@/server/schemas";

describe("task schemas", () => {
  it("accepts an unfinished extracted task without a deadline", () => {
    expect(
      extractedTaskSchema.parse({
        id: "task-1",
        title: "Ta med idrottskläder",
        kind: "bring",
        dueAt: null,
        notes: null,
        confidence: 0.91,
        sourceExcerpt: "Ta med idrottskläder.",
      }),
    ).toMatchObject({ kind: "bring", dueAt: null });
  });

  it("rejects invented or malformed extraction fields", () => {
    expect(() =>
      extractedTaskSchema.parse({
        id: "task-1",
        title: "Lämna blanketten",
        kind: "form",
        dueAt: "nästa vecka",
        completedAt: null,
        notes: null,
        confidence: 0.8,
        sourceExcerpt: "Lämnas nästa vecka.",
      }),
    ).toThrow();
  });

  it("validates manual creation and the exact completion command", () => {
    expect(
      manualTaskSchema.parse({
        personId: "person-nora",
        title: "Öva glosor",
        kind: "homework",
        dueAt: "2026-08-24T18:00:00+02:00",
        notes: null,
      }),
    ).toMatchObject({ kind: "homework", recurrence: "once" });
    expect(
      manualTaskSchema.parse({
        personId: "person-nora",
        title: "Torka bordet",
        kind: "other",
        recurrence: "daily",
        dueAt: null,
        notes: null,
      }),
    ).toMatchObject({ recurrence: "daily" });
    expect(taskCompletionSchema.parse({ completed: true })).toEqual({ completed: true });
    expect(() => taskCompletionSchema.parse({ completed: true, title: "Byt titel" })).toThrow();
  });
});
