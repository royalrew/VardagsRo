import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock, TEST_ACTOR } from "../../../../test/actor-fixture";

import type { ConfirmDocumentInput, FamilyDocument } from "@/lib/types";

const services = vi.hoisted(() => ({
  deleteSource: vi.fn(),
  getDocument: vi.fn(),
  loadDashboard: vi.fn(),
  removeDocument: vi.fn(),
  saveConfirmedDocument: vi.fn(),
  uploadSource: vi.fn(),
}));

vi.mock("@/server/actor", () => actorModuleMock());
vi.mock("@/server/database", () => ({
  getDocument: services.getDocument,
  loadDashboard: services.loadDashboard,
  removeDocument: services.removeDocument,
  saveConfirmedDocument: services.saveConfirmedDocument,
}));
vi.mock("@/server/storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/storage")>();
  return {
    ...original,
    deleteSource: services.deleteSource,
    uploadSource: services.uploadSource,
  };
});

import { DELETE } from "@/app/api/documents/[id]/route";
import { POST } from "@/app/api/documents/route";

const FILE_BYTES = new TextEncoder().encode("%PDF-1.4\nconfirm-original");
const FILE_HASH = createHash("sha256").update(FILE_BYTES).digest("hex");
const STORAGE_KEY =
  "household-demo/documents/2026/08/123e4567-e89b-12d3-a456-426614174000.pdf";

const storedDocument: FamilyDocument = {
  id: "document-1",
  householdId: "household-demo",
  title: "Veckobrev",
  filename: "veckobrev.pdf",
  mimeType: "application/pdf",
  documentType: "Skolbrev",
  personId: "person-nora",
  folderId: null,
  status: "confirmed",
  uploadedAt: "2026-08-21T18:00:00.000Z",
  periodLabel: "Nästa vecka",
  summary: "Information från skolan.",
  storageKey: STORAGE_KEY,
  hash: FILE_HASH,
  eventsCount: 0,
  tasksCount: 0,
};

function confirmInput(): ConfirmDocumentInput {
  return {
    extraction: {
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
      hash: FILE_HASH,
    },
    personId: "person-nora",
    events: [],
    tasks: [],
  };
}

function multipartRequest(
  input: ConfirmDocumentInput,
  options: { filename?: string; declaredMimeType?: string; bytes?: Uint8Array } = {},
): Request {
  const form = new FormData();
  const bytes = options.bytes ?? FILE_BYTES;
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  form.append("input", JSON.stringify(input));
  form.append(
    "file",
    new Blob([arrayBuffer], {
      type: options.declaredMimeType ?? "application/pdf",
    }),
    options.filename ?? "veckobrev.pdf",
  );
  return new Request("http://localhost/api/documents", {
    method: "POST",
    body: form,
    headers: { origin: "http://localhost" },
  });
}

describe("document confirmation and deletion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_BASE_URL", "http://localhost");
    services.uploadSource.mockResolvedValue(STORAGE_KEY);
    services.deleteSource.mockResolvedValue(true);
    services.saveConfirmedDocument.mockImplementation(
      async (_actor: unknown, input: ConfirmDocumentInput) => ({
        document: { ...storedDocument, storageKey: input.extraction.storageKey },
        events: [],
        tasks: [],
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uploads the verified original only when the user confirms it", async () => {
    const response = await POST(multipartRequest(confirmInput()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      document: { storageKey: STORAGE_KEY },
      events: [],
      tasks: [],
    });
    expect(body).not.toHaveProperty("data");
    expect(services.uploadSource).toHaveBeenCalledWith(
      TEST_ACTOR.householdId,
      expect.any(Uint8Array),
      "application/pdf",
      FILE_HASH,
    );
    expect(services.saveConfirmedDocument).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        extraction: expect.objectContaining({ storageKey: STORAGE_KEY }),
      }),
    );
  });

  it.each([
    ["hash", (input: ConfirmDocumentInput) => (input.extraction.hash = "wrong"), "CONFIRM_HASH_MISMATCH"],
    ["mime", (input: ConfirmDocumentInput) => (input.extraction.mimeType = "image/png"), "CONFIRM_MIME_MISMATCH"],
    ["filename", (input: ConfirmDocumentInput) => (input.extraction.originalFilename = "annan.pdf"), "CONFIRM_FILENAME_MISMATCH"],
  ])("rejects a %s mismatch before upload", async (_name, mutate, code) => {
    const input = confirmInput();
    mutate(input);
    const response = await POST(multipartRequest(input));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code });
    expect(services.uploadSource).not.toHaveBeenCalled();
    expect(services.saveConfirmedDocument).not.toHaveBeenCalled();
  });

  it("rejects a file whose declared type and signature disagree", async () => {
    const response = await POST(
      multipartRequest(confirmInput(), { declaredMimeType: "image/png" }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ code: "FILE_SIGNATURE_MISMATCH" });
    expect(services.uploadSource).not.toHaveBeenCalled();
  });

  it("rejects a client-provided storage key before upload", async () => {
    const input = confirmInput();
    input.extraction.storageKey = STORAGE_KEY;

    const response = await POST(multipartRequest(input));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "CLIENT_STORAGE_KEY_NOT_ALLOWED" });
    expect(services.uploadSource).not.toHaveBeenCalled();
  });

  it("compensates in R2 when the atomic database save fails", async () => {
    services.saveConfirmedDocument.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(multipartRequest(confirmInput()));

    expect(response.status).toBe(500);
    expect(services.deleteSource).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("rejects JSON confirmation in production", async () => {
    const response = await POST(
      new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify(confirmInput()),
      }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ code: "CONFIRM_MULTIPART_REQUIRED" });
    expect(services.saveConfirmedDocument).not.toHaveBeenCalled();
  });

  it("allows unstored JSON confirmation only in local demo mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await POST(
      new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify(confirmInput()),
      }),
    );

    expect(response.status).toBe(201);
    expect(services.uploadSource).not.toHaveBeenCalled();
    expect(services.saveConfirmedDocument).toHaveBeenCalledWith(
      TEST_ACTOR,
      expect.objectContaining({
        extraction: expect.objectContaining({ storageKey: null }),
      }),
    );
  });

  it("keeps the database row when R2 deletion fails", async () => {
    services.getDocument.mockResolvedValue(storedDocument);
    services.deleteSource.mockResolvedValue(false);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: storedDocument.id }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "DOCUMENT_STORAGE_DELETE_FAILED" });
    expect(services.removeDocument).not.toHaveBeenCalled();
  });

  it("returns an explicit partial-failure error if DB deletion fails after R2", async () => {
    services.getDocument.mockResolvedValue(storedDocument);
    services.deleteSource.mockResolvedValue(true);
    services.removeDocument.mockRejectedValue(new Error("database delete failed"));

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: storedDocument.id }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "DOCUMENT_DATABASE_DELETE_FAILED" });
    expect(services.deleteSource.mock.invocationCallOrder[0]).toBeLessThan(
      services.removeDocument.mock.invocationCallOrder[0],
    );
  });
});
