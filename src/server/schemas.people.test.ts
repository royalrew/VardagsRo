import { describe, expect, it } from "vitest";

import { parseAliases } from "@/components/FamilySettingsModal";
import {
  householdUpdateSchema,
  personCreateSchema,
  personUpdateSchema,
} from "@/server/schemas";

describe("family member input", () => {
  it("trims and de-duplicates aliases without caring about case", () => {
    const parsed = personCreateSchema.parse({
      name: "  Karl  ",
      role: " Storebror ",
      personType: "child",
      aliases: ["Kalle", " kalle ", "Kal", "KALLE"],
    });

    expect(parsed.name).toBe("Karl");
    expect(parsed.role).toBe("Storebror");
    expect(parsed.aliases).toEqual(["Kalle", "Kal"]);
  });

  it("defaults to no aliases and rejects an empty name or role", () => {
    expect(personCreateSchema.parse({ name: "Ida", role: "Lillasyster", personType: "child" }).aliases).toEqual([]);
    expect(() => personCreateSchema.parse({ name: "   ", role: "Mamma", personType: "adult" })).toThrow();
    expect(() => personCreateSchema.parse({ name: "Ida", role: "  ", personType: "child" })).toThrow();
    expect(() => personCreateSchema.parse({ name: "Ida", role: "Mamma", personType: "adult", extra: 1 })).toThrow();
  });

  it("rejects control characters that would break the rendered name", () => {
    expect(() => personCreateSchema.parse({ name: "Ida\u0000", role: "Mamma", personType: "adult" })).toThrow();
    expect(() => personCreateSchema.parse({ name: "Ida", role: "Mamma\u001f", personType: "adult" })).toThrow();
    expect(() => householdUpdateSchema.parse({ name: "Familjen\u001fBerg" })).toThrow();
    expect(householdUpdateSchema.parse({ name: "  Familjen Berg  " }).name).toBe("Familjen Berg");
  });

  it("requires an update to actually change something", () => {
    expect(() => personUpdateSchema.parse({})).toThrow();
    expect(personUpdateSchema.parse({ role: "Pappa" })).toEqual({ role: "Pappa" });
    expect(personUpdateSchema.parse({ aliases: [] })).toEqual({ aliases: [] });
  });

  it("splits the comma-separated alias field the way the form presents it", () => {
    expect(parseAliases("Kalle, Karl-Erik ,, ")).toEqual(["Kalle", "Karl-Erik"]);
    expect(parseAliases("   ")).toEqual([]);
  });
});
