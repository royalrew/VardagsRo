import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = { cycle: false, childCount: 0, documentCount: 0 };
  const folderRow = (id: string, parentId: string | null = null) => ({
    id,
    household_id: "household-demo",
    parent_id: parentId,
    name: id === "folder-child" ? "Brev" : "Skola",
    created_at: "2026-08-21T12:00:00.000Z",
    updated_at: "2026-08-21T12:00:00.000Z",
  });
  const documentRow = {
    id: "document-school",
    household_id: "household-demo",
    title: "Veckobrev",
    filename: "veckobrev.pdf",
    mime_type: "application/pdf",
    document_type: "Skolbrev",
    person_id: "person-nora",
    folder_id: null,
    status: "confirmed",
    uploaded_at: "2026-08-21T12:00:00.000Z",
    period_label: "Vecka 35",
    summary: "Skolinformation",
    storage_key: null,
    sha256: null,
    events_count: 1,
    tasks_count: 2,
  };
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.includes("pg_advisory_xact_lock")) return Promise.resolve([{}]);
    if (text.startsWith("with recursive descendants")) return Promise.resolve([{ cycle: state.cycle }]);
    if (text.includes("as child_count")) {
      return Promise.resolve([{ child_count: state.childCount, document_count: state.documentCount }]);
    }
    if (text.includes("select id from family_document_folders") && text.includes("for update")) {
      return Promise.resolve([{ id: String(values[0]) }]);
    }
    if (text.includes("from family_document_folders") && text.includes("where id =")) {
      const id = String(values[0]);
      return Promise.resolve(id === "folder-missing" ? [] : [folderRow(id)]);
    }
    if (text.includes("lower(name) = lower")) return Promise.resolve([{ taken: false }]);
    if (text.includes("insert into family_document_folders")) {
      return Promise.resolve([folderRow(String(values[0]), values[2] as string | null)]);
    }
    if (text.includes("update family_document_folders")) {
      return Promise.resolve([{
        ...folderRow(String(values[2]), values[1] as string | null),
        name: String(values[0]),
      }]);
    }
    if (text.includes("from family_documents d")) return Promise.resolve([documentRow]);
    if (text.includes("update family_documents")) {
      return Promise.resolve([{
        ...documentRow,
        title: values[1] as string,
        folder_id: values[3] as string | null,
      }]);
    }
    if (text.includes("delete from family_document_folders")) return Promise.resolve([]);
    if (text.includes("insert into family_audit_log")) return Promise.resolve([]);
    throw new Error(`Unexpected query in test: ${text}`);
  });
  const begin = vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql));
  Object.assign(sql, { begin, json: (value: unknown) => value });
  return { begin, calls, sql, state };
});

vi.mock("postgres", () => ({ default: () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://folders.test/database",
  demoFallbackAllowed: () => false,
}));

import {
  createDocumentFolder,
  removeDocumentFolder,
  updateDocumentFolder,
  updateDocumentOrganization,
} from "@/server/database";

describe("document folder household boundaries", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.begin.mockClear();
    database.state.cycle = false;
    database.state.childCount = 0;
    database.state.documentCount = 0;
  });

  it("creates a folder only in the active household", async () => {
    const folder = await createDocumentFolder(TEST_ACTOR, { name: "Skola", parentId: null });
    const insert = database.calls.find((call) => call.text.includes("insert into family_document_folders"));
    expect(database.begin).toHaveBeenCalledOnce();
    expect(database.calls[0]?.text).toContain("pg_advisory_xact_lock");
    expect(database.calls[0]?.values).toEqual([1_947_046_335, "household-demo"]);
    expect(insert?.values[1]).toBe("household-demo");
    expect(folder).toMatchObject({ householdId: "household-demo", parentId: null });
  });

  it("rejects moving a folder below its descendant", async () => {
    database.state.cycle = true;
    await expect(updateDocumentFolder(TEST_ACTOR, "folder-school", { parentId: "folder-child" })).rejects.toMatchObject({
      status: 409,
      code: "FOLDER_CYCLE",
    });
    expect(database.begin).toHaveBeenCalledOnce();
    expect(database.calls[0]?.text).toContain("pg_advisory_xact_lock");
    expect(database.calls.findIndex((call) => call.text.includes("pg_advisory_xact_lock"))).toBeLessThan(
      database.calls.findIndex((call) => call.text.includes("from family_document_folders")),
    );
    expect(database.calls.some((call) => call.text.includes("update family_document_folders"))).toBe(false);
  });

  it("scopes both target folder lookup and document update", async () => {
    const saved = await updateDocumentOrganization(TEST_ACTOR, "document-school", {
      title: "Nytt veckobrev",
      folderId: "folder-school",
    });
    const folderLookup = database.calls.find(
      (call) => call.text.includes("from family_document_folders") && call.values[0] === "folder-school",
    );
    const update = database.calls.find((call) => call.text.includes("update family_documents"));
    expect(database.begin).toHaveBeenCalledOnce();
    expect(database.calls[0]?.text).toContain("pg_advisory_xact_lock");
    expect(folderLookup?.text).toContain("and household_id = ?");
    expect(folderLookup?.values).toEqual(["folder-school", "household-demo"]);
    expect(update?.text).toContain("where id = ? and household_id = ?");
    expect(update?.values.slice(-2)).toEqual(["document-school", "household-demo"]);
    expect(saved).toMatchObject({ title: "Nytt veckobrev", folderId: "folder-school" });
  });

  it("does not take the folder graph lock for a title-only update", async () => {
    await updateDocumentOrganization(TEST_ACTOR, "document-school", { title: "Nytt namn" });
    // The change still runs in a transaction, because the audit row has to live
    // or die with it. What a title-only edit must not do is lock the folder
    // graph, which would serialise every unrelated rename in the household.
    expect(database.calls.some((call) => call.text.includes("pg_advisory_xact_lock"))).toBe(false);
    expect(database.calls.some((call) => call.text.includes("update family_documents"))).toBe(true);
  });

  it("does not delete a folder containing documents", async () => {
    database.state.documentCount = 1;
    await expect(removeDocumentFolder(TEST_ACTOR, "folder-school")).rejects.toMatchObject({
      status: 409,
      code: "FOLDER_NOT_EMPTY",
    });
    expect(database.begin).toHaveBeenCalledOnce();
    expect(database.calls[0]?.text).toContain("pg_advisory_xact_lock");
    expect(database.calls.findIndex((call) => call.text.includes("pg_advisory_xact_lock"))).toBeLessThan(
      database.calls.findIndex((call) => call.text.includes("for update")),
    );
    expect(database.calls.some((call) => call.text.includes("delete from family_document_folders"))).toBe(false);
  });
});
