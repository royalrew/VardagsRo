import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: string[] = [];
  const sql = vi.fn((strings: TemplateStringsArray) => {
    calls.push(strings.join("?").replace(/\s+/g, " ").trim());
    return Promise.resolve([]);
  });
  Object.assign(sql, {
    begin: vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql)),
    json: (value: unknown) => value,
  });
  return { calls, sql };
});

vi.mock("postgres", () => ({ default: () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://health-gate.test/database",
  demoFallbackAllowed: () => false,
}));

import { saveConfirmedDocument } from "@/server/database";

function confirmation(documentType: string, title: string) {
  return {
    personId: "person-1",
    events: [],
    tasks: [],
    extraction: {
      title,
      documentType,
      summary: "",
      personHint: "",
      personId: null,
      periodLabel: "",
      events: [],
      tasks: [],
      originalFilename: "bild.jpg",
      mimeType: "image/jpeg" as const,
      storageKey: null,
      hash: "abc",
    },
  };
}

describe("care documents are refused before anything is written", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
  });

  it("refuses a dentist letter and touches the database not at all", async () => {
    await expect(
      saveConfirmedDocument(TEST_ACTOR, confirmation("Kallelse", "Tandläkarbesök")),
    ).rejects.toMatchObject({ status: 415, code: "HEALTH_DOCUMENT_NOT_SUPPORTED" });

    // The point of the rule is that the text is never stored. A refusal that
    // happened after the insert would satisfy the message and break the promise.
    expect(database.calls).toHaveLength(0);
  });

  it("refuses before the page would be read, so no text is extracted from it", async () => {
    // OCR belongs after this gate. Reading the page and refusing afterwards
    // would mean the care text existed in the process, which is the thing being
    // avoided. This test fails the day that order is reversed.
    await expect(
      saveConfirmedDocument(TEST_ACTOR, confirmation("Remiss", "Till logoped")),
    ).rejects.toMatchObject({ code: "HEALTH_DOCUMENT_NOT_SUPPORTED" });

    expect(database.sql).not.toHaveBeenCalled();
  });

  it("lets a school letter through to the ordinary path", async () => {
    await saveConfirmedDocument(
      TEST_ACTOR,
      confirmation("Skolbrev", "Veckobrev v36"),
    ).catch(() => undefined);

    expect(database.calls.length).toBeGreaterThan(0);
  });
});
