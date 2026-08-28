import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const state = {
    session: null as { user: { id: string } } | null,
    membership: null as Record<string, unknown> | null,
  };
  const sql = vi.fn(() => Promise.resolve(state.membership ? [state.membership] : []));
  return { state, sql };
});

const solo = vi.hoisted(() => ({
  loadSoloProgress: vi.fn(),
  logSoloAction: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => harness.state.session } }),
}));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://solo.test/database",
  demoFallbackAllowed: () => false,
  appBaseUrl: () => "http://localhost",
  isProductionRuntime: () => false,
  telegramConfig: () => null,
}));
vi.mock("@/server/database", () => ({
  readyClient: async () => harness.sql,
}));
vi.mock("@/server/solo", () => solo);

import { POST as logAction } from "@/app/api/solo/actions/route";
import { GET as soloGet } from "@/app/api/solo/route";

function membership(role: "owner" | "adult" | "viewer", userId = "user-jimmy") {
  return {
    membership_id: "membership-1",
    user_id: userId,
    household_id: "household-1",
    person_id: "person-1",
    role,
    person_type: "adult",
  };
}

function getRequest(): Request {
  return new Request("http://localhost/api/solo");
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/solo/actions", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  harness.state.session = null;
  harness.state.membership = null;
  solo.loadSoloProgress.mockReset();
  solo.logSoloAction.mockReset();
  solo.loadSoloProgress.mockResolvedValue({ today: "2026-08-28" });
  solo.logSoloAction.mockResolvedValue({ id: "action-1", xp: 50 });
});

describe("GET /api/solo", () => {
  it("refuses an anonymous caller", async () => {
    const response = await soloGet(getRequest());

    expect(response.status).toBe(401);
    expect(solo.loadSoloProgress).not.toHaveBeenCalled();
  });

  it("reads progress for the signed-in account and nobody else", async () => {
    harness.state.session = { user: { id: "user-jimmy" } };
    harness.state.membership = membership("owner");

    const response = await soloGet(getRequest());

    expect(response.status).toBe(200);
    // The account is taken from the session, never from the request, so one
    // adult cannot ask the endpoint for another adult's ledger.
    expect(solo.loadSoloProgress).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-jimmy" }),
    );
  });
});

describe("POST /api/solo/actions", () => {
  it("refuses an anonymous caller", async () => {
    const response = await logAction(
      postRequest({
        kind: "application_sent",
        occurredOn: "2026-08-26",
        evidence: "Ansökan skickad",
      }),
    );

    expect(response.status).toBe(401);
    expect(solo.logSoloAction).not.toHaveBeenCalled();
  });

  it("refuses a read-only member", async () => {
    harness.state.session = { user: { id: "user-jimmy" } };
    harness.state.membership = membership("viewer");

    const response = await logAction(
      postRequest({
        kind: "application_sent",
        occurredOn: "2026-08-26",
        evidence: "Ansökan skickad",
      }),
    );

    expect(response.status).toBe(403);
    expect(solo.logSoloAction).not.toHaveBeenCalled();
  });

  it("rejects an entry without evidence before it reaches the ledger", async () => {
    harness.state.session = { user: { id: "user-jimmy" } };
    harness.state.membership = membership("owner");

    const response = await logAction(
      postRequest({
        kind: "application_sent",
        occurredOn: "2026-08-26",
        evidence: "",
      }),
    );

    expect(response.status).toBe(400);
    expect(solo.logSoloAction).not.toHaveBeenCalled();
  });

  it("logs a valid outward action", async () => {
    harness.state.session = { user: { id: "user-jimmy" } };
    harness.state.membership = membership("owner");

    const response = await logAction(
      postRequest({
        kind: "application_sent",
        occurredOn: "2026-08-26",
        evidence: "Junior utvecklare, Combitech Växjö",
      }),
    );

    expect(response.status).toBe(201);
    expect(solo.logSoloAction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-jimmy" }),
      expect.objectContaining({ kind: "application_sent" }),
    );
  });
});
