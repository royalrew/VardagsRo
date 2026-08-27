import { describe, expect, it } from "vitest";

import { eventUpdateSchema, manualEventSchema } from "@/server/schemas";

const completeUpdate = {
  personId: "person-nora",
  title: "Fotbollsträning",
  category: "sport" as const,
  startsAt: "2026-08-24T17:00:00+02:00",
  endsAt: "2026-08-24T18:30:00+02:00",
  allDay: false,
  location: null,
  notes: null,
};

describe("event schemas", () => {
  it("requires every editable field for PATCH and rejects extras", () => {
    expect(eventUpdateSchema.parse(completeUpdate)).toEqual(completeUpdate);

    for (const field of Object.keys(completeUpdate)) {
      const incomplete: Record<string, unknown> = { ...completeUpdate };
      delete incomplete[field];
      expect(eventUpdateSchema.safeParse(incomplete).success, field).toBe(false);
    }
    expect(eventUpdateSchema.safeParse({ ...completeUpdate, householdId: "other" }).success).toBe(false);
  });

  it("keeps POST defaults separate from the complete PATCH contract", () => {
    expect(
      manualEventSchema.parse({
        personId: "person-nora",
        title: "Fotbollsträning",
        startsAt: completeUpdate.startsAt,
        endsAt: completeUpdate.endsAt,
      }),
    ).toMatchObject({
      category: "other",
      allDay: false,
      location: null,
      notes: null,
    });
  });
});
