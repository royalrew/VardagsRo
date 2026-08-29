import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const OWNER_KEY = `p100/${TEST_ACTOR.userId}/body/2026/08/0f9d2a1c-7b3e-4a55-9c21-1d4f6b8e0a37.jpg`;
const OWNER_PREVIEW_KEY = OWNER_KEY.replace(".jpg", "-preview.jpg");

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = { sessionExists: true, insertFails: false, mediaExists: true };

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });

    if (text.includes("insert into project100_media")) {
      if (state.insertFails) return Promise.reject(new Error("insert failed"));
      return Promise.resolve([]);
    }
    if (text.includes("delete from project100_media")) {
      return Promise.resolve([{ id: "media-1" }]);
    }
    if (text.includes("select id from project100_training_sessions")) {
      return Promise.resolve(state.sessionExists ? [{ id: values[0] }] : []);
    }
    if (text.includes("select id, title, to_char(session_date")) {
      return Promise.resolve([
        { id: "session-1", title: "Helkropp hemma", session_date: "2026-08-26" },
      ]);
    }
    if (text.includes("select original_key, preview_key from project100_media")) {
      return Promise.resolve(
        state.mediaExists
          ? [{ original_key: OWNER_KEY, preview_key: OWNER_PREVIEW_KEY }]
          : [],
      );
    }
    if (text.includes("select original_key from project100_media")) {
      return Promise.resolve(state.mediaExists ? [{ original_key: OWNER_KEY }] : []);
    }
    if (text.includes("select category, count(*)")) {
      return Promise.resolve([{ category: "body", total: 2 }]);
    }
    if (text.includes("from project100_media m")) {
      return Promise.resolve([
        {
          id: "media-1",
          category: "body",
          captured_on: "2026-08-26",
          caption: "Morgonljus, samma vinkel",
          original_key: OWNER_KEY,
          original_bytes: 2_400_000,
          preview_key: OWNER_PREVIEW_KEY,
          width: 3024,
          height: 4032,
          session_id: null,
          session_title: null,
          created_at: "2026-08-26T06:20:00.000Z",
        },
      ]);
    }
    if (text.includes("family_audit_log")) return Promise.resolve([]);

    throw new Error(`Unexpected query in test: ${text}`);
  });

  const begin = vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql));
  Object.assign(sql, { begin, json: (value: unknown) => value });
  return { begin, calls, sql, state };
});

const storage = vi.hoisted(() => ({
  uploadProject100Media: vi.fn(async () => ({
    originalKey: OWNER_KEY,
    previewKey: OWNER_PREVIEW_KEY,
  })),
  signedProject100MediaUrl: vi.fn(async (_userId: string, key: string) => `https://signed.test/${key}`),
  // Mirrors the real guard: a key that does not name this owner is not deleted.
  deleteProject100MediaObject: vi.fn(
    async (userId: string, key: string) => key.startsWith(`p100/${userId}/`),
  ),
}));

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));
vi.mock("@/server/storage", () => ({
  PROJECT100_MEDIA_CATEGORIES: ["body", "food", "training", "content"],
  storageIsConfigured: () => true,
  validateProject100Image: () => "image/jpeg",
  uploadProject100Media: storage.uploadProject100Media,
  signedProject100MediaUrl: storage.signedProject100MediaUrl,
  deleteProject100MediaObject: storage.deleteProject100MediaObject,
}));

import {
  createProject100Media,
  deleteProject100Media,
  loadProject100MediaLibrary,
  loadProject100SessionOptions,
  signedProject100MediaOriginalUrl,
} from "@/server/project100-media";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

function upload() {
  return {
    original: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), declaredMimeType: "image/jpeg" },
    preview: null,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    category: "body" as const,
    capturedOn: "2026-08-26",
    caption: "Morgonljus, samma vinkel",
    sessionId: null,
    width: 3024,
    height: 4032,
    ...overrides,
  };
}

describe("Projekt 100 media library", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.state.sessionExists = true;
    database.state.insertFails = false;
    database.state.mediaExists = true;
    storage.uploadProject100Media.mockClear();
    storage.signedProject100MediaUrl.mockClear();
    storage.deleteProject100MediaObject.mockClear();
    storage.deleteProject100MediaObject.mockImplementation(async () => true);
  });

  it("scopes every media query to the signed-in account", async () => {
    await loadProject100MediaLibrary(TEST_ACTOR, { category: null, limit: 60 });
    const touched = database.calls.filter((call) => call.text.includes("project100_"));

    expect(touched.length).toBeGreaterThan(0);
    for (const call of touched) {
      expect(call.text).toMatch(/user_id = \?/);
      expect(call.values).toContain(TEST_ACTOR.userId);
    }
  });

  it("keeps a child out before a single picture is read", async () => {
    await expect(loadProject100MediaLibrary(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    await expect(loadProject100SessionOptions(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(deleteProject100Media(CHILD, "media-1")).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("hands out a freshly signed preview address instead of a stored one", async () => {
    const library = await loadProject100MediaLibrary(TEST_ACTOR);

    expect(storage.signedProject100MediaUrl).toHaveBeenCalledWith(
      TEST_ACTOR.userId,
      OWNER_PREVIEW_KEY,
      300,
    );
    expect(library.items[0]?.previewUrl).toBe(`https://signed.test/${OWNER_PREVIEW_KEY}`);
    expect(library.urlExpiresInSeconds).toBe(300);
    // The storage key itself is not part of the response the browser receives.
    expect(JSON.stringify(library)).not.toContain(OWNER_KEY);
  });

  it("signs a full-size picture only after finding it under this account", async () => {
    const signed = await signedProject100MediaOriginalUrl(TEST_ACTOR, "media-1");
    const lookup = database.calls.find((call) =>
      call.text.includes("select original_key from project100_media"),
    );

    expect(lookup?.text).toContain("user_id = ?");
    expect(lookup?.values).toEqual(["media-1", TEST_ACTOR.userId]);
    expect(signed.expiresInSeconds).toBe(300);

    database.state.mediaExists = false;
    await expect(signedProject100MediaOriginalUrl(TEST_ACTOR, "media-1")).rejects.toMatchObject({
      code: "PROJECT100_MEDIA_NOT_FOUND",
      status: 404,
    });
  });

  it("refuses to attach a picture to a session that is not the account's", async () => {
    database.state.sessionExists = false;

    await expect(
      createProject100Media(TEST_ACTOR, input({ sessionId: "session-elsewhere" }), upload()),
    ).rejects.toMatchObject({ code: "PROJECT100_SESSION_NOT_FOUND", status: 404 });
    expect(storage.uploadProject100Media).not.toHaveBeenCalled();
  });

  it("removes the stored objects again when the row cannot be written", async () => {
    database.state.insertFails = true;

    await expect(createProject100Media(TEST_ACTOR, input(), upload())).rejects.toMatchObject({
      code: "PROJECT100_MEDIA_NOT_SAVED",
    });
    expect(storage.deleteProject100MediaObject.mock.calls.map((call) => call[1])).toEqual([
      OWNER_KEY,
      OWNER_PREVIEW_KEY,
    ]);
  });

  it("audits that a picture was added without recording what it shows", async () => {
    await createProject100Media(TEST_ACTOR, input(), upload());
    const audit = database.calls.find((call) => call.text.includes("family_audit_log"));
    const serialized = JSON.stringify(audit?.values ?? []);

    expect(audit?.values).toContain("project100.media.create");
    expect(serialized).toContain("body");
    expect(serialized).not.toContain("Morgonljus");
    expect(serialized).not.toContain(OWNER_KEY);
  });

  it("deletes the stored picture before the row that points at it", async () => {
    await expect(deleteProject100Media(TEST_ACTOR, "media-1")).resolves.toBe(true);

    const deletedObjects = storage.deleteProject100MediaObject.mock.invocationCallOrder[0];
    const rowDelete = database.calls.findIndex((call) =>
      call.text.includes("delete from project100_media"),
    );
    expect(deletedObjects).toBeDefined();
    expect(rowDelete).toBeGreaterThanOrEqual(0);
    expect(storage.deleteProject100MediaObject.mock.calls.map((call) => call[1])).toEqual([
      OWNER_KEY,
      OWNER_PREVIEW_KEY,
    ]);
  });

  it("keeps the row when the picture itself could not be removed", async () => {
    // A row that disappears while the object survives would hide a body picture
    // from the only list that can delete it.
    storage.deleteProject100MediaObject.mockImplementation(async () => false);

    await expect(deleteProject100Media(TEST_ACTOR, "media-1")).rejects.toMatchObject({
      code: "PROJECT100_MEDIA_STILL_STORED",
      status: 502,
    });
    expect(
      database.calls.some((call) => call.text.includes("delete from project100_media")),
    ).toBe(false);
  });

  it("reports a miss rather than a silent success for someone else's id", async () => {
    database.state.mediaExists = false;

    await expect(deleteProject100Media(TEST_ACTOR, "media-elsewhere")).resolves.toBe(false);
    expect(storage.deleteProject100MediaObject).not.toHaveBeenCalled();
    expect(database.calls.some((call) => call.text.includes("family_audit_log"))).toBe(false);
  });
});
