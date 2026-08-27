import { describe, expect, it } from "vitest";

import { parseSwedishQuestion } from "@/lib/question-engine";
import type { FamilyPerson } from "@/lib/types";

function person(
  id: string,
  name: string,
  role: string,
  personType: "adult" | "child",
  aliases: string[],
): FamilyPerson {
  return {
    id,
    householdId: "household-test",
    name,
    role,
    personType,
    aliases,
    initials: name.slice(0, 1),
    color: "#476b5b",
    tint: "#dfece4",
  };
}

/**
 * A household where the members do not all share a surname, and where two
 * siblings do. Blended families are ordinary, so name matching has to cope with
 * both without guessing. The names here are invented; real household data
 * belongs in the database, never in the repository.
 */
const people: FamilyPerson[] = [
  person("parent-self", "Robin", "Jag", "adult", ["pappa", "far", "Robin Ek"]),
  person("parent-other", "Kim", "Mamma", "adult", ["mor", "Kim Ek"]),
  person("child-noa", "Noa", "Son", "child", ["Noa Falk"]),
  person("child-vide", "Vide", "Son", "child", ["Vide Holm"]),
  person("child-sigrid", "Sigrid", "Dotter", "child", ["Sigrid Falk"]),
  person("child-tuva", "Tuva", "Dotter", "child", ["Tuva Ek"]),
];

const now = new Date("2026-08-25T09:00:00.000Z");

function plan(question: string) {
  return parseSwedishQuestion(question, {
    people,
    now,
    timeZone: "Europe/Stockholm",
    currentPersonId: "parent-self",
  });
}

describe("matching family members by name", () => {
  it("finds a child by full name, whichever surname they carry", () => {
    expect(plan("Vad har Noa Falk imorgon?")?.personIds).toEqual(["child-noa"]);
    expect(plan("Vad har Vide Holm imorgon?")?.personIds).toEqual(["child-vide"]);
    expect(plan("Vad har Tuva Ek imorgon?")?.personIds).toEqual(["child-tuva"]);
  });

  it("still finds them by first name alone", () => {
    expect(plan("Vad har Sigrid imorgon?")?.personIds).toEqual(["child-sigrid"]);
    expect(plan("Vad har Vide imorgon?")?.personIds).toEqual(["child-vide"]);
  });

  it("handles the Swedish possessive on a full name", () => {
    expect(plan("Vad har Noa Falks klass imorgon?")?.personIds).toEqual(["child-noa"]);
  });

  it("resolves the words a family actually uses for a parent", () => {
    expect(plan("Jobbar pappa imorgon?")?.personIds).toEqual(["parent-self"]);
    expect(plan("Vad gör mamma imorgon?")?.personIds).toEqual(["parent-other"]);
    expect(plan("Vad gör jag imorgon?")?.personIds).toEqual(["parent-self"]);
  });

  it("refuses to guess between two siblings who share a surname", () => {
    // Noa and Sigrid are both Falk. A bare surname must not silently resolve to
    // one of them, because answering for the wrong child is worse than asking.
    const bare = plan("Vad har Falk imorgon?");
    expect(bare?.personIds ?? null).not.toEqual(["child-noa"]);
    expect(bare?.personIds ?? null).not.toEqual(["child-sigrid"]);
  });

  it("prefers the longer full name over the bare first name", () => {
    // Aliases are matched longest-first, so a document naming the child in full
    // resolves to exactly that child.
    expect(plan("Vad har Sigrid Falk imorgon?")?.personIds).toEqual(["child-sigrid"]);
  });
});
