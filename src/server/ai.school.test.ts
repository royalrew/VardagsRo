import { describe, expect, it } from "vitest";

import { mergeParallelSchoolLessons } from "@/server/ai";

type Lesson = Parameters<typeof mergeParallelSchoolLessons>[0][number];

function lesson(
  startsAt: string,
  endsAt: string,
  title: string,
  location: string | null = null,
  overrides: Partial<Lesson> = {},
): Lesson {
  return {
    title,
    category: "school",
    startsAt,
    endsAt,
    allDay: false,
    location,
    notes: null,
    confidence: 0.98,
    sourceExcerpt: `${startsAt.slice(11, 16)} ${title}`,
    ...overrides,
  };
}

describe("mergeParallelSchoolLessons", () => {
  it("collapses a language slot into one entry that keeps every alternative", () => {
    const merged = mergeParallelSchoolLessons([
      lesson("2026-08-31T10:00:00+02:00", "2026-08-31T10:50:00+02:00", "Tyska", "D26"),
      lesson("2026-08-31T10:00:00+02:00", "2026-08-31T10:50:00+02:00", "Spanska", "A23"),
      lesson("2026-08-31T10:00:00+02:00", "2026-08-31T10:50:00+02:00", "Franska", "A22"),
      lesson("2026-08-31T10:00:00+02:00", "2026-08-31T10:50:00+02:00", "Engelska", "H3"),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Tyska / Spanska / Franska / Engelska");
    expect(merged[0].location).toBeNull();
    expect(merged[0].notes).toContain("Eleven går i en av dessa");
    expect(merged[0].notes).toContain("- Franska (A22)");
    expect(merged[0].notes).toContain("- Engelska (H3)");
  });

  it("keeps the subject when only the group differs, as for two craft groups", () => {
    const merged = mergeParallelSchoolLessons([
      lesson("2026-09-03T08:10:00+02:00", "2026-09-03T09:30:00+02:00", "Slöjd", "C11"),
      lesson("2026-09-03T08:10:00+02:00", "2026-09-03T09:30:00+02:00", "Slöjd", "C13"),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Slöjd");
    expect(merged[0].location).toBeNull();
    expect(merged[0].notes).toContain("- Slöjd (C11)");
    expect(merged[0].notes).toContain("- Slöjd (C13)");
  });

  it("marks the slot as uncertain so it reads as a question, not a fact", () => {
    const merged = mergeParallelSchoolLessons([
      lesson("2026-09-02T11:40:00+02:00", "2026-09-02T12:35:00+02:00", "Svenska som andraspråk", "B21"),
      lesson("2026-09-02T11:40:00+02:00", "2026-09-02T12:35:00+02:00", "Svenska", "E23"),
    ]);

    expect(merged[0].confidence).toBeLessThanOrEqual(0.4);
  });

  it("covers the whole slot when the alternatives end at different times", () => {
    const merged = mergeParallelSchoolLessons([
      lesson("2026-08-25T08:10:00+02:00", "2026-08-25T08:55:00+02:00", "Spanska", "A23"),
      lesson("2026-08-25T08:10:00+02:00", "2026-08-25T09:05:00+02:00", "Franska", "A22"),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].startsAt).toBe("2026-08-25T08:10:00+02:00");
    expect(merged[0].endsAt).toBe("2026-08-25T09:05:00+02:00");
  });

  it("leaves an ordinary school day untouched", () => {
    const day = [
      lesson("2026-09-04T08:10:00+02:00", "2026-09-04T09:10:00+02:00", "Naturorienterande ämnen", "B23"),
      lesson("2026-09-04T09:15:00+02:00", "2026-09-04T10:35:00+02:00", "Bild", "A18"),
      lesson("2026-09-04T11:40:00+02:00", "2026-09-04T12:30:00+02:00", "Teknik", "C15"),
    ];

    expect(mergeParallelSchoolLessons(day)).toEqual(day);
  });

  it("does not merge lessons that only touch, such as lunch and the class after it", () => {
    const merged = mergeParallelSchoolLessons([
      lesson("2026-08-31T11:00:00+02:00", "2026-08-31T11:30:00+02:00", "Lunch"),
      lesson("2026-08-31T11:30:00+02:00", "2026-08-31T12:25:00+02:00", "Svenska", "E23"),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("never merges across categories, so school and work stay separate", () => {
    const events = [
      lesson("2026-08-31T08:10:00+02:00", "2026-08-31T08:50:00+02:00", "Klassråd", "E23"),
      lesson("2026-08-31T08:10:00+02:00", "2026-08-31T16:00:00+02:00", "Jobb", null, {
        category: "work",
      }),
    ];

    expect(mergeParallelSchoolLessons(events)).toHaveLength(2);
  });

  it("preserves a note the schedule already carried", () => {
    const merged = mergeParallelSchoolLessons([
      lesson("2026-09-01T14:10:00+02:00", "2026-09-01T15:00:00+02:00", "Tyska", "D26", {
        notes: "Ta med boken.",
      }),
      lesson("2026-09-01T14:10:00+02:00", "2026-09-01T15:00:00+02:00", "Franska", "A22"),
    ]);

    expect(merged[0].notes).toContain("Ta med boken.");
    expect(merged[0].notes).toContain("Eleven går i en av dessa");
  });
});
