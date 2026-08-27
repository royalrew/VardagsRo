import { beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock, TEST_ACTOR } from "../../../../test/actor-fixture";
import type { FamilyDocumentFolder } from "@/lib/types";
import { AppError } from "@/server/errors";

const services = vi.hoisted(() => ({
  createDocumentFolder: vi.fn(),
  loadDashboard: vi.fn(),
  removeDocumentFolder: vi.fn(),
  updateDocumentFolder: vi.fn(),
}));

vi.mock("@/server/database", () => services);
vi.mock("@/server/actor", () => actorModuleMock());

import { DELETE, PATCH } from "@/app/api/document-folders/[id]/route";
import { GET, POST } from "@/app/api/document-folders/route";

const folder: FamilyDocumentFolder = {
  id: "folder-school",
  householdId: "household-demo",
  parentId: null,
  name: "Skola",
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
};

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("document folder routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    services.loadDashboard.mockResolvedValue({ folders: [folder] });
    services.createDocumentFolder.mockResolvedValue(folder);
    services.updateDocumentFolder.mockResolvedValue(folder);
    services.removeDocumentFolder.mockResolvedValue(undefined);
  });

  it("returns only the folder DTO collection", async () => {
    const response = await GET(new Request("http://localhost/api/document-folders"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ folders: [folder] });
  });

  it("validates and creates a folder", async () => {
    const response = await POST(jsonRequest("http://localhost/api/document-folders", "POST", {
      name: "  Skola  ",
      parentId: null,
    }));
    expect(response.status).toBe(201);
    expect(services.createDocumentFolder).toHaveBeenCalledWith(TEST_ACTOR, {
      name: "Skola",
      parentId: null,
    });
    expect(await response.json()).toEqual({ folder });
  });

  it("validates dynamic ids and exact update fields", async () => {
    const invalid = await PATCH(
      jsonRequest("http://localhost", "PATCH", { name: "Brev" }),
      { params: Promise.resolve({ id: "../foreign" }) },
    );
    expect(invalid.status).toBe(400);
    expect(services.updateDocumentFolder).not.toHaveBeenCalled();

    const extraField = await PATCH(
      jsonRequest("http://localhost", "PATCH", { name: "Brev", householdId: "foreign" }),
      { params: Promise.resolve({ id: folder.id }) },
    );
    expect(extraField.status).toBe(400);
    expect(services.updateDocumentFolder).not.toHaveBeenCalled();
  });

  it("preserves a non-empty folder and returns a conflict", async () => {
    services.removeDocumentFolder.mockRejectedValueOnce(
      new AppError(409, "FOLDER_NOT_EMPTY", "Folder must be empty."),
    );
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: folder.id }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "FOLDER_NOT_EMPTY" });
  });
});
