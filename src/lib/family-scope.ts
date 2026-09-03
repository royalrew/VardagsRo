import type { FamilyEvent, FamilyPerson } from "@/lib/types";

/**
 * An event with no person concerns the whole family: dinner at grandma's, a
 * moving day, a school holiday. Rather than let every view guard against a
 * missing person, the family itself is handed out as a person-shaped value so
 * avatars and event details keep working unchanged.
 */
export const FAMILY_SCOPE_ID = "__family__";

export function isFamilyWide(event: Pick<FamilyEvent, "personId">): boolean {
  return event.personId === null;
}

export function familyScopePerson(familyName: string, householdId: string): FamilyPerson {
  return {
    id: FAMILY_SCOPE_ID,
    householdId,
    name: familyName || "Familjen",
    role: "Alla",
    // Display only. The family scope has no membership row, so it can never
    // become an actor and this value is never an authorization input.
    personType: "adult",
    aliases: [],
    initials: "•",
    color: "#5f6f66",
    tint: "#e6ece8",
  };
}

/**
 * Resolve who an event belongs to for display. Never returns undefined, so a
 * view can render it without a non-null assertion hiding a missing row.
 */
export function personForEvent(
  people: FamilyPerson[],
  event: Pick<FamilyEvent, "personId">,
  family: FamilyPerson,
): FamilyPerson {
  if (event.personId === null) return family;
  return people.find((person) => person.id === event.personId) ?? family;
}

/** The people grid has one column per real family member. */
export function calendarColumns(people: FamilyPerson[]): FamilyPerson[] {
  return people;
}

/**
 * Does this event belong in the given person's column? A family-wide event
 * concerns every member and is therefore visible without a synthetic family
 * column taking up permanent space in the grid.
 */
export function eventBelongsToColumn(
  event: Pick<FamilyEvent, "personId">,
  columnId: string,
): boolean {
  return event.personId === null
    ? columnId !== FAMILY_SCOPE_ID
    : event.personId === columnId;
}

/**
 * Which events a given person should see in their own view: their own, plus
 * everything that concerns the whole family.
 */
export function eventConcernsPerson(
  event: Pick<FamilyEvent, "personId">,
  personId: string,
): boolean {
  return event.personId === null || event.personId === personId;
}
