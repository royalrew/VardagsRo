import { beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock, TEST_ACTOR } from "../../../../test/actor-fixture";

import type { FamilyDocument } from "@/lib/types";

const services = vi.hoisted(() => ({
  getDocument: vi.fn(),
  loadDashboard: vi.fn(),
  removeDocument: vi.fn(),
  updateDocumentOrganization: vi.fn(),
}));

vi.mock("@/server/database", () => services);
vi.mock("@/server/storage", () => ({
  deleteSource: vi.fn(),
  signedSourceUrl: vi.fn(),
}));
vi.mock("@/server/actor", () => actorModuleMock());

import { PATCH } from "@/app/api/documents/[id]/route";

const document: FamilyDocument = {
  id: "document-school",
  householdId: "household-demo",
  title: "Veckobrev",
  filename: "veckobrev.pdf",
  mimeType: "application/pdf",
  documentType: "Skolbrev",
  personId: "person-nora",
  folderId: "folder-school",
  status: "confirmed",
  uploadedAt: "2026-08-21T12:00:00.000Z",
  periodLabel: "Vecka 35",
  summary: "Skolinformation",
  storageKey: null,
  hash: null,
  eventsCount: 1,
  tasksCount: 2,
};

describe("PATCH /api/documents/[id] organization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    services.updateDocumentOrganization.mockResolvedValue(document);
  });

  it("allows a title and folder move but no storage mutation", async () => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "  Nytt veckobrev  ", folderId: null }),
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(response.status).toBe(200);
    expect(services.updateDocumentOrganization).toHaveBeenCalledWith(TEST_ACTOR, document.id, {
      title: "Nytt veckobrev",
      folderId: null,
    });
    expect(await response.json()).toEqual({ document });
  });

  it("rejects empty and privileged changes", async () => {
    for (const body of [{}, { storageKey: "household-demo/documents/private.pdf" }]) {
      const response = await PATCH(
        new Request("http://localhost", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: document.id }) },
      );
      expect(response.status).toBe(400);
    }
    expect(services.updateDocumentOrganization).not.toHaveBeenCalled();
  });
});
