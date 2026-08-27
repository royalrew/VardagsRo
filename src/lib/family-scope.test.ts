import { describe, expect, it } from "vitest";

import {
  FAMILY_SCOPE_ID,
  calendarColumns,
  eventBelongsToColumn,
  eventConcernsPerson,
  familyScopePerson,
  isFamilyWide,
  personForEvent,
} from "@/lib/family-scope";
import type { FamilyEvent, FamilyPerson } from "@/lib/types";

function person(id: string, name: string): FamilyPerson {
  return {
    id,
    householdId: "h",
    name,
    role: "Barn",
    personType: "child",
    aliases: [],
    initials: name.slice(0, 1),
    color: "#476b5b",
    tint: "#dfece4",
  };
}

function event(personId: string | null): FamilyEvent {
  return {
    id: `event-${personId ?? "family"}`,
    householdId: "h",
    personId,
    documentId: null,
    title: "Middag hos mormor",
    category: "family",
    startsAt: "2026-08-25T16:00:00.000Z",
    endsAt: "2026-08-25T18:00:00.000Z",
    allDay: false,
    location: null,
    notes: null,
    status: "confirmed",
    confidence: 1,
    sourceExcerpt: null,
  };
}

const people = [person("noa", "Noa"), person("tuva", "Tuva")];
const family = familyScopePerson("Familjen Test", "h");

describe("family-wide events", () => {
  it("treats a missing person as the whole family", () => {
    expect(isFamilyWide(event(null))).toBe(true);
    expect(isFamilyWide(event("noa"))).toBe(false);
  });

  it("always resolves someone to render, so no event can vanish", () => {
    expect(personForEvent(people, event("noa"), family).name).toBe("Noa");
    expect(personForEvent(people, event(null), family).id).toBe(FAMILY_SCOPE_ID);
    // A person who was removed while the page was open must not blank the event.
    expect(personForEvent(people, event("borttagen"), family).id).toBe(FAMILY_SCOPE_ID);
  });

  it("puts the family first among the columns", () => {
    const columns = calendarColumns(people, family);
    expect(columns.map((column) => column.id)).toEqual([FAMILY_SCOPE_ID, "noa", "tuva"]);
  });

  it("states a shared event once instead of repeating it under everyone", () => {
    expect(eventBelongsToColumn(event(null), FAMILY_SCOPE_ID)).toBe(true);
    expect(eventBelongsToColumn(event(null), "noa")).toBe(false);
    expect(eventBelongsToColumn(event("noa"), "noa")).toBe(true);
    expect(eventBelongsToColumn(event("noa"), FAMILY_SCOPE_ID)).toBe(false);
  });

  it("counts a shared event as concerning each family member", () => {
    // This is what a child's own view relies on: their own plus everything
    // that involves the whole family.
    expect(eventConcernsPerson(event(null), "noa")).toBe(true);
    expect(eventConcernsPerson(event(null), "tuva")).toBe(true);
    expect(eventConcernsPerson(event("noa"), "noa")).toBe(true);
    expect(eventConcernsPerson(event("noa"), "tuva")).toBe(false);
  });

  it("falls back to a readable name when the household has none", () => {
    expect(familyScopePerson("", "h").name).toBe("Familjen");
  });
});
