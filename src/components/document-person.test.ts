import { describe, expect, it } from "vitest";

import { findPersonId } from "@/components/AddDocumentModal";
import type { DocumentExtraction, FamilyPerson } from "@/lib/types";

function person(id: string, name: string, role: string, aliases: string[] = []): FamilyPerson {
  return {
    id,
    householdId: "household-1",
    name,
    role,
    personType: role === "Jag" || role === "Mamma" ? "adult" : "child",
    aliases,
    initials: name.slice(0, 1),
    color: "#476b5b",
    tint: "#dfece4",
  };
}

const family = [
  person("person-parent", "Nora", "Jag"),
  person("person-other", "Mikael", "Mamma"),
  person("person-child", "Elias", "Son", ["Elias Berg"]),
];

function extraction(overrides: Partial<DocumentExtraction> = {}): DocumentExtraction {
  return {
    title: "Schema",
    documentType: "Skolschema",
    summary: "",
    personHint: "",
    personId: null,
    periodLabel: "",
    events: [],
    tasks: [],
    originalFilename: "schema.jpg",
    mimeType: "image/jpeg",
    storageKey: null,
    hash: "abc",
    ...overrides,
  };
}

describe("findPersonId", () => {
  it("uses the person the server already matched", () => {
    expect(findPersonId(extraction({ personId: "person-child" }), family)).toBe("person-child");
  });

  it("matches a name, a role or an alias exactly", () => {
    expect(findPersonId(extraction({ personHint: "Elias" }), family)).toBe("person-child");
    expect(findPersonId(extraction({ personHint: "mamma" }), family)).toBe("person-other");
    expect(findPersonId(extraction({ personHint: "Elias Berg" }), family)).toBe("person-child");
  });

  it("says nothing when a school timetable names a class instead of a child", () => {
    // This is the ordinary case for a timetable, and the old fallback made it
    // land on whoever came first in the household: the parent with role "Jag".
    // A parent then saw their child's lessons proposed as their own hours.
    expect(findPersonId(extraction({ personHint: "Elev i 7A" }), family)).toBeNull();
  });

  it("says nothing when the document does not name anyone", () => {
    expect(findPersonId(extraction({ personHint: "" }), family)).toBeNull();
  });

  it("ignores a matched id that is not in this household", () => {
    expect(findPersonId(extraction({ personId: "person-from-elsewhere" }), family)).toBeNull();
  });

  it("never falls back to the first family member", () => {
    for (const hint of ["Elev i 7A", "Klass 9A2", "Vårdnadshavare", ""]) {
      expect(findPersonId(extraction({ personHint: hint }), family)).not.toBe("person-parent");
    }
  });
});
