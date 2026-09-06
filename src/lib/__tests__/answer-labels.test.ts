import { describe, expect, it } from "vitest";

import { answerQuestionDeterministically } from "@/lib/question-engine";
import type { FamilyEvent, FamilyPerson, QuestionPlan } from "@/lib/types";

const HOUSEHOLD = "household-1";

/**
 * In this household the owner's role is literally "Jag". A label that preferred
 * the role over the name therefore made every answer about that person read as
 * if the assistant were talking about itself.
 */
const people: FamilyPerson[] = [
  {
    id: "person-owner",
    householdId: HOUSEHOLD,
    name: "Nora",
    role: "Jag",
    personType: "adult",
    aliases: [],
    initials: "N",
    color: "#111111",
    tint: "#eeeeee",
  },
  {
    id: "person-other",
    householdId: HOUSEHOLD,
    name: "Mikael",
    role: "Mamma",
    personType: "adult",
    aliases: [],
    initials: "M",
    color: "#222222",
    tint: "#dddddd",
  },
];

function workEvent(personId: string): FamilyEvent {
  return {
    id: `event-${personId}`,
    householdId: HOUSEHOLD,
    personId,
    documentId: null,
    title: "Jobb",
    category: "work",
    startsAt: "2026-09-01T06:00:00.000Z",
    endsAt: "2026-09-01T14:00:00.000Z",
    allDay: false,
    location: null,
    notes: null,
    status: "confirmed",
    confidence: 1,
    sourceExcerpt: null,
  };
}

const plan: QuestionPlan = {
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-09-01T23:59:00.000Z",
  personIds: [],
  activityTerms: ["work"],
  intent: "work",
  needsOverlap: false,
};

function answer(personIds: string[], currentPersonId?: string) {
  return answerQuestionDeterministically({
    plan: { ...plan, personIds },
    people,
    events: [workEvent("person-owner"), workEvent("person-other")],
    timeZone: "Europe/Stockholm",
    currentPersonId,
  }).text;
}

describe("who an answer says it is about", () => {
  it("never calls someone by the role Jag", () => {
    // The bug: "Jobbar Nora imorgon?" answered "Ja. Jag – Jobb kl. 08.00–16.00".
    expect(answer(["person-owner"])).not.toMatch(/\bJag\b\s*–/);
  });

  it("uses the person's name when someone else asks", () => {
    expect(answer(["person-owner"], "person-other")).toContain("Nora");
  });

  it("says du to the person who asked", () => {
    expect(answer(["person-owner"], "person-owner")).toMatch(/\bdu\b/);
    expect(answer(["person-owner"], "person-owner")).not.toContain("Nora");
  });

  it("keeps the other person's name in the same answer", () => {
    const both = answer([], "person-owner");

    expect(both).toMatch(/\bdu\b/);
    expect(both).toContain("Mikael");
  });

  it("covers the whole family when the question names nobody", () => {
    // The planner used to fill in the person asking when a question named no
    // one. "Vad händer på torsdag?" then answered only about them, and a day
    // full of the family's entries was reported as empty whenever they
    // personally had nothing.
    const everyone = answer([], "person-owner");

    expect(everyone).toMatch(/\bdu\b/);
    expect(everyone).toContain("Mikael");
  });

  it("reads as a sentence rather than as a row of data", () => {
    const text = answer(["person-other"], "person-owner");

    expect(text).toContain("Mikael jobbar");
    expect(text).not.toContain("–  ");
    expect(text).not.toMatch(/^\w+ – /);
  });

  it("falls back to the role only when a person has no name", () => {
    const nameless = people.map((person) =>
      person.id === "person-other" ? { ...person, name: "" } : person,
    );

    const text = answerQuestionDeterministically({
      plan: { ...plan, personIds: ["person-other"] },
      people: nameless,
      events: [workEvent("person-other")],
      timeZone: "Europe/Stockholm",
    }).text;

    expect(text).toContain("Mamma");
  });
});
