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
  latestUndoableDeletion: vi.fn(async () => null),
  undoDeletion: vi.fn(async () => ({ label: "Träning", kind: "event" as const })),
  createHouseholdLogin: vi.fn(async () => ({
    email: "ny@exempel.se",
    personName: "Ida",
    role: "viewer" as const,
  })),
  listHouseholdLogins: vi.fn(async () => []),
}));
// Projekt 100 storage is covered in its own scope test; here the routes are
// only asked who they let through.
vi.mock("@/server/project100-training", () => ({
  loadProject100TrainingSessions: vi.fn(async () => []),
  loadProject100TrainingTemplates: vi.fn(async () => []),
  createProject100TrainingSession: vi.fn(async () => ({ id: "session-1" })),
  createProject100TrainingTemplate: vi.fn(async () => ({ id: "template-1" })),
  deleteProject100TrainingSession: vi.fn(async () => true),
  updateProject100TrainingSession: vi.fn(async () => ({ id: "session-1" })),
  archiveProject100TrainingTemplate: vi.fn(async () => true),
}));
vi.mock("@/server/project100-journal", () => ({
  loadProject100Journal: vi.fn(async () => ({
    today: "2026-08-29",
    from: "2025-08-29",
    to: "2026-08-29",
    query: null,
    entries: [],
    totalEntries: 0,
    excludedCount: 0,
  })),
  saveProject100JournalEntry: vi.fn(async () => ({
    writtenOn: "2026-08-26",
    body: "Kändes starkt",
    mood: null,
    energy: null,
    sleepHours: null,
    excludedFromAi: false,
    updatedAt: "2026-08-26T20:14:00.000Z",
  })),
  deleteProject100JournalEntry: vi.fn(async () => true),
}));
vi.mock("@/server/project100-body", () => ({
  loadProject100BodyJourney: vi.fn(async () => ({
    today: "2026-08-29",
    from: "2026-06-01",
    to: "2026-08-29",
    entries: [],
    goal: { weightGoalKg: 100, startWeightKg: 80, heightCm: null },
    weightHistory: [],
  })),
  saveProject100BodyEntry: vi.fn(async () => ({
    measuredOn: "2026-08-26",
    note: null,
    measurements: [],
  })),
  deleteProject100BodyEntry: vi.fn(async () => true),
  saveProject100Settings: vi.fn(async () => ({
    weightGoalKg: 100,
    startWeightKg: 80,
    heightCm: null,
  })),
}));
vi.mock("@/server/project100-media", () => ({
  loadProject100MediaLibrary: vi.fn(async () => ({
    items: [],
    counts: { body: 0, food: 0, training: 0, content: 0 },
    urlExpiresInSeconds: 300,
    storageConfigured: true,
  })),
  loadProject100SessionOptions: vi.fn(async () => []),
  createProject100Media: vi.fn(async () => ({ id: "media-1" })),
  deleteProject100Media: vi.fn(async () => true),
  signedProject100MediaOriginalUrl: vi.fn(async () => ({
    url: "https://signed.test/original",
    expiresInSeconds: 300,
  })),
}));

import { PATCH as householdPatch } from "@/app/api/household/route";
import { GET as loginsGet } from "@/app/api/logins/route";
import { POST as undoPost } from "@/app/api/undo/route";
import { POST as createLogin } from "@/app/api/people/[id]/login/route";
import { POST as peoplePost } from "@/app/api/people/route";
import { GET as tasksGet, POST as tasksPost } from "@/app/api/tasks/route";
import {
  GET as trainingSessionsGet,
  POST as trainingSessionsPost,
} from "@/app/api/project100/training/sessions/route";
import {
  DELETE as trainingSessionDelete,
  PATCH as trainingSessionPatch,
} from "@/app/api/project100/training/sessions/[id]/route";
import { POST as trainingTemplatesPost } from "@/app/api/project100/training/templates/route";
import { GET as journalGet, POST as journalPost } from "@/app/api/project100/journal/route";
import { DELETE as journalDelete } from "@/app/api/project100/journal/[date]/route";
import { GET as bodyGet, POST as bodyPost } from "@/app/api/project100/body/route";
import { DELETE as bodyDelete } from "@/app/api/project100/body/[date]/route";
import { PATCH as settingsPatch } from "@/app/api/project100/settings/route";
import { GET as mediaGet, POST as mediaPost } from "@/app/api/project100/media/route";
import { DELETE as mediaDelete } from "@/app/api/project100/media/[id]/route";
import { GET as mediaUrlGet } from "@/app/api/project100/media/[id]/url/route";

function membership(
  role: "owner" | "adult" | "viewer",
  personType: "adult" | "child" = "adult",
) {
  return {
    membership_id: "membership-1",
    user_id: "user-1",
    household_id: "household-real",
    person_id: "person-1",
    role,
    person_type: personType,
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

  it("keeps a viewer from undoing, since they could not have deleted either", async () => {
    harness.state.membership = membership("viewer");

    const response = await undoPost(jsonPost("http://localhost/api/undo", { id: "1" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("lets an adult undo their own deletion", async () => {
    harness.state.membership = membership("adult");

    const response = await undoPost(jsonPost("http://localhost/api/undo", { id: "1" }));

    expect(response.status).toBe(200);
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

describe("Projekt 100 is a private adult workspace", () => {
  const sessionsUrl = "http://localhost/api/project100/training/sessions";

  function trainingSession() {
    return {
      title: "Helkropp hemma",
      activityType: "strength_home",
      status: "completed",
      sessionDate: "2026-08-26",
      exercises: [{ name: "Marklyft", sets: [{ reps: 8, weightKg: 60 }] }],
    };
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 before it tells anyone that training data exists", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    const read = await trainingSessionsGet(new Request(sessionsUrl));
    const write = await trainingSessionsPost(jsonPost(sessionsUrl, trainingSession()));

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  it("keeps a child in the household out of the adult workspace", async () => {
    // A child may read the family calendar. Body, weight and training are not
    // household data and stay closed even for a signed-in family member.
    harness.state.membership = membership("viewer", "child");

    const read = await trainingSessionsGet(new Request(sessionsUrl));

    expect(read.status).toBe(403);
    expect(await read.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
  });

  it("lets a read-only adult look without letting them log", async () => {
    harness.state.membership = membership("viewer");

    const read = await trainingSessionsGet(new Request(sessionsUrl));
    const write = await trainingSessionsPost(jsonPost(sessionsUrl, trainingSession()));

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("refuses a training write that arrives from another site", async () => {
    const response = await trainingSessionsPost(
      new Request(sessionsUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://elak.example",
        },
        body: JSON.stringify(trainingSession()),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("refuses a filter it does not understand instead of ignoring it", async () => {
    // An unread `?userId=` must never look like it was honoured.
    const response = await trainingSessionsGet(
      new Request(`${sessionsUrl}?userId=someone-else`),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("refuses an id that tries to walk out of its own route", async () => {
    const response = await trainingSessionDelete(
      new Request(`${sessionsUrl}/x`, { method: "DELETE", headers: { origin: "http://localhost" } }),
      { params: Promise.resolve({ id: "../templates/template-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("keeps a read-only adult from closing a planned pass", async () => {
    const move = {
      action: "move",
      sessionDate: "2026-08-28",
      plannedStartAt: null,
      plannedEndAt: null,
    };
    const patch = (): Request =>
      new Request("http://localhost/api/project100/training/sessions/session-1", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify(move),
      });

    harness.state.membership = membership("viewer");
    const viewer = await trainingSessionPatch(patch(), {
      params: Promise.resolve({ id: "session-1" }),
    });

    harness.state.membership = membership("adult");
    const adult = await trainingSessionPatch(patch(), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(viewer.status).toBe(403);
    expect(await viewer.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
    expect(adult.status).toBe(200);
  });

  it("holds a template to the same gates as a session", async () => {
    harness.state.membership = membership("viewer", "child");
    const child = await trainingTemplatesPost(
      jsonPost("http://localhost/api/project100/training/templates", {
        name: "30 min helkropp",
        activityType: "strength_home",
        exercises: [{ name: "Marklyft", sets: [{ reps: 12 }] }],
      }),
    );

    harness.state.membership = membership("adult");
    const adult = await trainingTemplatesPost(
      jsonPost("http://localhost/api/project100/training/templates", {
        name: "30 min helkropp",
        activityType: "strength_home",
        exercises: [{ name: "Marklyft", sets: [{ reps: 12 }] }],
      }),
    );

    expect(child.status).toBe(403);
    expect(adult.status).toBe(201);
  });
});

describe("Projekt 100 media is gated like the rest of the workspace", () => {
  const mediaUrl = "http://localhost/api/project100/media";

  function imageForm(): FormData {
    const form = new FormData();
    form.set("category", "body");
    form.set("capturedOn", "2026-08-26");
    form.set(
      "file",
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "bild.jpg", {
        type: "image/jpeg",
      }),
    );
    return form;
  }

  function upload(origin = "http://localhost"): Request {
    return new Request(mediaUrl, {
      method: "POST",
      headers: { origin },
      body: imageForm(),
    });
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 before it admits that a picture library exists", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    expect((await mediaGet(new Request(mediaUrl))).status).toBe(401);
    expect((await mediaPost(upload())).status).toBe(401);
  });

  it("keeps a child out of the picture library", async () => {
    harness.state.membership = membership("viewer", "child");

    const read = await mediaGet(new Request(mediaUrl));

    expect(read.status).toBe(403);
    expect(await read.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
  });

  it("keeps a read-only adult from adding pictures", async () => {
    harness.state.membership = membership("viewer");

    expect((await mediaGet(new Request(mediaUrl))).status).toBe(200);
    const write = await mediaPost(upload());
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("refuses an upload posted from another site", async () => {
    expect((await mediaPost(upload("https://elak.example"))).status).toBe(403);
  });

  it("refuses a filter it does not understand", async () => {
    const response = await mediaGet(new Request(`${mediaUrl}?userId=someone-else`));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("requires a real image, not just a form that says so", async () => {
    const response = await mediaPost(
      new Request(mediaUrl, {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ category: "body", capturedOn: "2026-08-26" }),
      }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_MULTIPART_REQUIRED" });
  });

  it("gates the signed full-size address and the deletion the same way", async () => {
    harness.state.membership = membership("viewer", "child");
    const childOpen = await mediaUrlGet(new Request(`${mediaUrl}/media-1/url`), {
      params: Promise.resolve({ id: "media-1" }),
    });

    harness.state.membership = membership("viewer");
    const viewerDelete = await mediaDelete(
      new Request(`${mediaUrl}/media-1`, {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ id: "media-1" }) },
    );

    expect(childOpen.status).toBe(403);
    expect(await childOpen.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(viewerDelete.status).toBe(403);
  });
});

describe("Projekt 100 body data is the most private of all", () => {
  const bodyUrl = "http://localhost/api/project100/body";

  function measurement() {
    return {
      measuredOn: "2026-08-26",
      note: null,
      measurements: [{ metric: "weight", label: null, unit: "kg", value: 83.4 }],
    };
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 before it admits that a weight was ever logged", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    expect((await bodyGet(new Request(bodyUrl))).status).toBe(401);
    expect((await bodyPost(jsonPost(bodyUrl, measurement()))).status).toBe(401);
  });

  it("keeps a child out of weight, measurements and the goal", async () => {
    harness.state.membership = membership("viewer", "child");

    const read = await bodyGet(new Request(bodyUrl));
    const goal = await settingsPatch(
      jsonPatch("http://localhost/api/project100/settings", {
        weightGoalKg: 100,
        startWeightKg: 80,
        heightCm: null,
      }),
    );

    expect(read.status).toBe(403);
    expect(await read.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(goal.status).toBe(403);
  });

  it("keeps a read-only adult from writing a measurement", async () => {
    harness.state.membership = membership("viewer");

    expect((await bodyGet(new Request(bodyUrl))).status).toBe(200);
    const write = await bodyPost(jsonPost(bodyUrl, measurement()));
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("refuses a filter it does not understand", async () => {
    const response = await bodyGet(new Request(`${bodyUrl}?userId=someone-else`));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("refuses a day that is not a real date", async () => {
    const response = await bodyDelete(
      new Request(`${bodyUrl}/2026-02-30`, {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ date: "2026-02-30" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a measurement posted from another site", async () => {
    const response = await bodyPost(
      new Request(bodyUrl, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://elak.example" },
        body: JSON.stringify(measurement()),
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("The diary is the most closed door in the workspace", () => {
  const journalUrl = "http://localhost/api/project100/journal";

  function written() {
    return {
      writtenOn: "2026-08-26",
      body: "Kändes starkt idag",
      mood: 4,
      energy: 3,
      sleepHours: 7.5,
      excludedFromAi: true,
    };
  }

  beforeEach(() => {
    harness.state.session = { user: { id: "user-1" } };
    harness.state.membership = membership("owner");
  });

  it("answers 401 before it admits that a diary exists", async () => {
    harness.state.session = null;
    harness.state.membership = null;

    expect((await journalGet(new Request(journalUrl))).status).toBe(401);
    expect((await journalPost(jsonPost(journalUrl, written()))).status).toBe(401);
  });

  it("keeps a child in the household out of an adult's writing", async () => {
    harness.state.membership = membership("viewer", "child");

    const read = await journalGet(new Request(journalUrl));

    expect(read.status).toBe(403);
    expect(await read.json()).toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
  });

  it("keeps a read-only adult from writing in it", async () => {
    harness.state.membership = membership("viewer");

    expect((await journalGet(new Request(journalUrl))).status).toBe(200);
    const write = await journalPost(jsonPost(journalUrl, written()));
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "READ_ONLY_MEMBER" });
  });

  it("refuses a filter it does not understand", async () => {
    const response = await journalGet(new Request(`${journalUrl}?userId=someone-else`));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PROJECT100_UNKNOWN_QUERY" });
  });

  it("refuses an entry with neither writing nor a check-in in it", async () => {
    const response = await journalPost(
      jsonPost(journalUrl, {
        writtenOn: "2026-08-26",
        body: null,
        mood: null,
        energy: null,
        sleepHours: null,
        excludedFromAi: false,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a day that is not a real date", async () => {
    const response = await journalDelete(
      new Request(`${journalUrl}/2026-13-01`, {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ date: "2026-13-01" }) },
    );

    expect(response.status).toBe(400);
  });

  it("refuses writing posted from another site", async () => {
    const response = await journalPost(
      new Request(journalUrl, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://elak.example" },
        body: JSON.stringify(written()),
      }),
    );

    expect(response.status).toBe(403);
  });
});
