import { beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock, TEST_ACTOR } from "../../../../../test/actor-fixture";

import type { FamilyEvent } from "@/lib/types";

const database = vi.hoisted(() => ({
  removeEvent: vi.fn(),
  updateManualEvent: vi.fn(),
}));

vi.mock("@/server/database", () => database);
vi.mock("@/server/actor", () => actorModuleMock());

import { PATCH } from "@/app/api/events/[id]/route";

const savedEvent: FamilyEvent = {
  id: "event-1",
  householdId: "household-demo",
  personId: "person-nora",
  documentId: null,
  title: "Fotbollsträning",
  category: "sport",
  startsAt: "2026-08-24T15:00:00.000Z",
  endsAt: "2026-08-24T16:30:00.000Z",
  allDay: false,
  location: "Plan 2",
  notes: "Ta med vatten",
  status: "confirmed",
  confidence: 1,
  sourceExcerpt: null,
};

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/events/event-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const input = {
  personId: "person-nora",
  title: "Fotbollsträning",
  category: "sport",
  startsAt: "2026-08-24T17:00:00+02:00",
  endsAt: "2026-08-24T18:30:00+02:00",
  allDay: false,
  location: "Plan 2",
  notes: "Ta med vatten",
};

describe("event PATCH API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the complete server-confirmed event after a strict update", async () => {
    database.updateManualEvent.mockResolvedValue(savedEvent);
    const response = await PATCH(patchRequest(input), {
      params: Promise.resolve({ id: "event-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event: savedEvent });
    expect(database.updateManualEvent).toHaveBeenCalledWith(TEST_ACTOR, "event-1", input);
  });

  it("rejects unknown fields before touching the database", async () => {
    const response = await PATCH(patchRequest({ ...input, householdId: "another-household" }), {
      params: Promise.resolve({ id: "event-1" }),
    });

    expect(response.status).toBe(400);
    expect(database.updateManualEvent).not.toHaveBeenCalled();
  });

  it.each([
    "personId",
    "title",
    "category",
    "startsAt",
    "endsAt",
    "allDay",
    "location",
    "notes",
  ] as const)("rejects PATCH when required field %s is missing", async (field) => {
    const incomplete: Record<string, unknown> = { ...input };
    delete incomplete[field];

    const response = await PATCH(patchRequest(incomplete), {
      params: Promise.resolve({ id: "event-1" }),
    });

    expect(response.status).toBe(400);
    expect(database.updateManualEvent).not.toHaveBeenCalled();
  });

  it("returns 404 when the event is outside the active household", async () => {
    database.updateManualEvent.mockResolvedValue(null);
    const response = await PATCH(patchRequest(input), {
      params: Promise.resolve({ id: "event-other" }),
    });

    expect(response.status).toBe(404);
  });
});
