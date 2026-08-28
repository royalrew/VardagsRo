import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const state = {
    session: null as { user: { id: string } } | null,
    membership: null as Record<string, unknown> | null,
  };
  const sql = vi.fn(() => Promise.resolve(harness_membership()));
  function harness_membership() {
    return state.membership ? [state.membership] : [];
  }
  return { state, sql };
});

vi.mock("@/server/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => harness.state.session } }),
}));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://permissions.test/database",
  demoFallbackAllowed: () => false,
  appBaseUrl: () => "http://localhost",
  isProductionRuntime: () => false,
  telegramConfig: () => null,
}));
vi.mock("@/server/database", () => ({
  readyClient: async () => harness.sql,
  loadDashboard: vi.fn(async () => ({ tasks: [], people: [], folders: [] })),
  saveManualTask: vi.fn(),
  saveManualEvent: vi.fn(),
  createPerson: vi.fn(),
  updateHouseholdName: vi.fn(),
  createHouseholdLogin: vi.fn(async () => ({
    email: "ny@exempel.se",
    personName: "Ida",
    role: "viewer" as const,
  })),
  listHouseholdLogins: vi.fn(async () => []),
}));

import { PATCH as householdPatch } from "@/app/api/household/route";
import { GET as loginsGet } from "@/app/api/logins/route";
import { POST as createLogin } from "@/app/api/people/[id]/login/route";
import { POST as peoplePost } from "@/app/api/people/route";
import { GET as tasksGet, POST as tasksPost } from "@/app/api/tasks/route";

function membership(role: "owner" | "adult" | "viewer") {
  return {
    membership_id: "membership-1",
    user_id: "user-1",
    household_id: "household-real",
    person_id: "person-1",
    role,
    person_type: "adult",
  };
}

function jsonPost(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

function jsonPatch(url: string, body: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

describe("routes refuse anyone without a verified session", () => {
  beforeEach(() => {
    harness.state.session = null;
    harness.state.membership = null;
  });

  it("answers 401 on a read instead of returning empty data", async () => {
    const response = await tasksGet(new Request("http://localhost/api/tasks"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "NOT_AUTHENTICATED" });
  });

  it("answers 401 on a write", async () => {
    const response = await tasksPost(
      jsonPost("http://localhost/api/tasks", {
        personId: "person-1",
        title: "Ta med idrottskläder",
        kind: "bring",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("refuses a signed-in account that belongs to no household", async () => {
    harness.state.session = { user: { id: "user-drifting" } };

    const response = await tasksGet(new Request("http://localhost/api/tasks"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "NO_HOUSEHOLD_MEMBERSHIP" });
  });
});

describe("roles decide what a member may change", () => {
  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
  });

  it("keeps a viewer from writing while still letting them read", async () => {
    harness.state.membership = membership("viewer");

    await expect(tasksGet(new Request("http://localhost/api/tasks"))).resolves.toMatchObject({
      status: 200,
    });

    const write = await tasksPost(
      jsonPost("http://localhost/api/tasks", {
        personId: "person-1",
        title: "Ta med idrottskläder",
        kind: "bring",
      }),
    );

    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("reserves handing out access to the owner", async () => {
    // Giving someone a login is not an ordinary edit: it decides who can see the
    // household's calendar and documents at all.
    harness.state.membership = membership("adult");

    const created = await createLogin(
      jsonPost("http://localhost/api/people/person-1/login", {
        personId: "person-1",
        email: "ny@exempel.se",
        password: "ett tillrackligt langt",
        role: "viewer",
      }),
      { params: Promise.resolve({ id: "person-1" }) },
    );
    const listed = await loginsGet(new Request("http://localhost/api/logins"));

    expect(created.status).toBe(403);
    expect(listed.status).toBe(403);
  });

  it("lets the owner hand out a login", async () => {
    harness.state.membership = membership("owner");

    const created = await createLogin(
      jsonPost("http://localhost/api/people/person-1/login", {
        personId: "person-1",
        email: "ny@exempel.se",
        password: "ett tillrackligt langt",
        role: "viewer",
      }),
      { params: Promise.resolve({ id: "person-1" }) },
    );

    expect(created.status).toBe(201);
  });

  it("reserves family composition and the household name for the owner", async () => {
    harness.state.membership = membership("adult");

    const person = await peoplePost(
      jsonPost("http://localhost/api/people", {
        name: "Ida",
        role: "Dotter",
        personType: "child",
      }),
    );
    const household = await householdPatch(
      jsonPatch("http://localhost/api/household", { name: "Familjen Zickaris" }),
    );

    expect(person.status).toBe(403);
    expect(await person.json()).toMatchObject({ code: "OWNER_REQUIRED" });
    expect(household.status).toBe(403);
  });
});

describe("cross-site writes", () => {
  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("refuses a write that arrives from another site", async () => {
    const response = await tasksPost(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://elak.example",
        },
        body: JSON.stringify({ personId: "person-1", title: "Hej", kind: "bring" }),
      }),
    );

    expect(response.status).toBe(403);
  });
});
