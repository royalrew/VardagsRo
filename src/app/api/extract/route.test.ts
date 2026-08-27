import { beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock } from "../../../../test/actor-fixture";

const services = vi.hoisted(() => ({
  extractDocument: vi.fn(),
  loadDashboard: vi.fn(),
  uploadSource: vi.fn(),
  validateUpload: vi.fn(),
  safeDisplayFilename: vi.fn(),
}));

vi.mock("@/server/ai", () => ({ extractDocument: services.extractDocument }));
vi.mock("@/server/database", () => ({ loadDashboard: services.loadDashboard }));
vi.mock("@/server/storage", () => ({
  MAX_UPLOAD_BYTES: 12 * 1024 * 1024,
  safeDisplayFilename: services.safeDisplayFilename,
  uploadSource: services.uploadSource,
  validateUpload: services.validateUpload,
}));
vi.mock("@/server/actor", () => actorModuleMock());

import { POST } from "@/app/api/extract/route";

describe("POST /api/extract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    services.validateUpload.mockReturnValue("application/pdf");
    services.safeDisplayFilename.mockReturnValue("veckobrev.pdf");
    services.loadDashboard.mockResolvedValue({
      people: [],
      timezone: "Europe/Stockholm",
    });
    services.extractDocument.mockResolvedValue({
      title: "Veckobrev",
      documentType: "Skolbrev",
      summary: "Information från skolan.",
      personHint: "Nora",
      personId: "person-nora",
      periodLabel: "Nästa vecka",
      events: [],
      tasks: [],
      originalFilename: "veckobrev.pdf",
      mimeType: "application/pdf",
      storageKey: null,
      hash: "server-hash",
    });
  });

  it("returns an unstored preview and never uploads during extraction", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new TextEncoder().encode("%PDF-1.4 preview")], {
        type: "application/pdf",
      }),
      "veckobrev.pdf",
    );

    const response = await POST(
      new Request("http://localhost/api/extract", { method: "POST", body: form }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ storageKey: null });
    expect(services.extractDocument).toHaveBeenCalledOnce();
    expect(services.uploadSource).not.toHaveBeenCalled();
  });
});
