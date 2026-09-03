import { describe, expect, it } from "vitest";
import {
  getCleaningAreaByName,
  getCleaningAreaForPerson,
  getKidsChoresOverview,
  taskForCalendarDate,
} from "./kids-chores";
import type { FamilyPerson, FamilyTask } from "./types";

describe("kids-chores", () => {
  const people: FamilyPerson[] = [
    {
      id: "person-alma",
      householdId: "household-1",
      name: "Alma",
      role: "Dotter",
      personType: "child",
      color: "#e056fd",
      initials: "A",
      tint: "#fdf0ff",
      aliases: ["Lillasyster"],
    },
    {
      id: "person-shureym",
      householdId: "household-1",
      name: "Shureym",
      role: "Son",
      personType: "child",
      color: "#30336b",
      initials: "S",
      tint: "#f0f2ff",
      aliases: ["Mellanbror"],
    },
    {
      id: "person-cuzeyr",
      householdId: "household-1",
      name: "Cuzeyr",
      role: "Son",
      personType: "child",
      color: "#22a6b3",
      initials: "C",
      tint: "#e6f8fa",
      aliases: ["Storebror"],
    },
    {
      id: "person-jimmy",
      householdId: "household-1",
      name: "Jimmy",
      role: "Pappa",
      personType: "adult",
      color: "#130f40",
      initials: "J",
      tint: "#ebeaf5",
      aliases: [],
    },
  ];

  const tasks: FamilyTask[] = [
    {
      id: "task-1",
      householdId: "household-1",
      personId: "person-alma",
      documentId: null,
      title: "Dammsuga lilla vardagsrummet",
      kind: "other",
      recurrence: "daily",
      dueAt: "2026-09-01T18:00:00.000Z",
      completedAt: null,
      notes: null,
      reviewStatus: "confirmed",
      confidence: 1,
      sourceExcerpt: null,
    },
    {
      id: "task-2",
      householdId: "household-1",
      personId: "person-alma",
      documentId: null,
      title: "Plocka undan leksaker",
      kind: "other",
      recurrence: "daily",
      dueAt: null,
      completedAt: "2026-09-01T15:00:00.000Z",
      notes: null,
      reviewStatus: "confirmed",
      confidence: 1,
      sourceExcerpt: null,
    },
    {
      id: "task-3",
      householdId: "household-1",
      personId: "person-cuzeyr",
      documentId: null,
      title: "Torka köksbänkar",
      kind: "other",
      recurrence: "once",
      dueAt: null,
      completedAt: "2026-09-01T16:00:00.000Z",
      notes: null,
      reviewStatus: "confirmed",
      confidence: 1,
      sourceExcerpt: null,
    },
  ];

  it("maps each child to their designated cleaning area", () => {
    expect(getCleaningAreaForPerson(people[0])?.area).toBe("Lilla vardagsrummet");
    expect(getCleaningAreaForPerson(people[0])?.icon).toBe("🛋️");

    expect(getCleaningAreaForPerson(people[1])?.area).toBe("Stora vardagsrummet");
    expect(getCleaningAreaForPerson(people[1])?.icon).toBe("📺");

    expect(getCleaningAreaForPerson(people[2])?.area).toBe("Köket");
    expect(getCleaningAreaForPerson(people[2])?.icon).toBe("🍳");

    expect(getCleaningAreaForPerson(people[3])).toBeNull();
  });

  it("finds cleaning area by name or area string", () => {
    expect(getCleaningAreaByName("alma")?.area).toBe("Lilla vardagsrummet");
    expect(getCleaningAreaByName("stora vardagsrummet")?.personName).toBe("Shureym");
    expect(getCleaningAreaByName("köket")?.personName).toBe("Cuzeyr");
  });

  it("calculates chores overview for children correctly", () => {
    const overview = getKidsChoresOverview(
      people,
      tasks,
      "2026-09-01T17:00:00.000Z",
      "Europe/Stockholm",
    );
    expect(overview).toHaveLength(3);

    const almaSummary = overview.find((s) => s.person.id === "person-alma");
    expect(almaSummary?.openCount).toBe(1);
    expect(almaSummary?.completedCount).toBe(1);
    expect(almaSummary?.allDone).toBe(false);

    const cuzeyrSummary = overview.find((s) => s.person.id === "person-cuzeyr");
    expect(cuzeyrSummary?.openCount).toBe(0);
    expect(cuzeyrSummary?.completedCount).toBe(1);
    expect(cuzeyrSummary?.allDone).toBe(true);

    const shureymSummary = overview.find((s) => s.person.id === "person-shureym");
    expect(shureymSummary?.openCount).toBe(0);
    expect(shureymSummary?.completedCount).toBe(0);
    expect(shureymSummary?.allDone).toBe(false);
  });

  it("reopens daily chores on the next Stockholm calendar day", () => {
    const yesterday = taskForCalendarDate(
      tasks[1],
      "2026-09-02T10:00:00.000Z",
      "Europe/Stockholm",
    );
    expect(yesterday.completedAt).toBeNull();

    const overview = getKidsChoresOverview(
      people,
      tasks,
      "2026-09-02T10:00:00.000Z",
      "Europe/Stockholm",
    );
    const almaSummary = overview.find((summary) => summary.person.id === "person-alma");
    expect(almaSummary?.openCount).toBe(2);
    expect(almaSummary?.completedCount).toBe(0);
    expect(almaSummary?.allDone).toBe(false);
  });

  it("does not let a completed one-off task claim that it was done today", () => {
    const overview = getKidsChoresOverview(
      people,
      tasks,
      "2026-09-02T10:00:00.000Z",
      "Europe/Stockholm",
    );
    const cuzeyrSummary = overview.find((summary) => summary.person.id === "person-cuzeyr");
    expect(cuzeyrSummary?.tasks).toHaveLength(0);
    expect(cuzeyrSummary?.allDone).toBe(false);
  });
});
