import { describe, expect, it } from "vitest";

import {
  buildDocumentConfirmationFormData,
  confirmsDocumentDeletion,
} from "@/components/release-contracts";
import type { ConfirmDocumentInput } from "@/lib/types";

const input: ConfirmDocumentInput = {
  extraction: {
    title: "Veckobrev",
    documentType: "Skolbrev",
    summary: "Information från skolan",
    personHint: "Nora",
    personId: "person-nora",
    periodLabel: "Vecka 35",
    events: [],
    tasks: [],
    originalFilename: "veckobrev.pdf",
    mimeType: "application/pdf",
    storageKey: null,
    hash: "abc123",
  },
  personId: "person-nora",
  events: [],
  tasks: [],
};

describe("document release contracts", () => {
  it("builds multipart confirmation with JSON input and the original file", async () => {
    const file = new File(["pdf-content"], "veckobrev.pdf", {
      type: "application/pdf",
    });

    const formData = buildDocumentConfirmationFormData(input, file);
    const storedFile = formData.get("file");

    expect(formData.get("input")).toBe(JSON.stringify(input));
    expect(storedFile).toBeInstanceOf(File);
    expect((storedFile as File).name).toBe("veckobrev.pdf");
    expect(await (storedFile as File).text()).toBe("pdf-content");
  });

  it("keeps the input-only multipart body available for local demo fallback", () => {
    const formData = buildDocumentConfirmationFormData(input, null);

    expect(formData.get("input")).toBe(JSON.stringify(input));
    expect(formData.has("file")).toBe(false);
  });

  it("only accepts an explicit successful delete without failed storage cleanup", () => {
    expect(confirmsDocumentDeletion({ deleted: true, storageDeleted: true })).toBe(true);
    expect(confirmsDocumentDeletion({ deleted: true })).toBe(true);
    expect(confirmsDocumentDeletion({ deleted: true, storageDeleted: false })).toBe(false);
    expect(confirmsDocumentDeletion({ deleted: false, storageDeleted: true })).toBe(false);
    expect(confirmsDocumentDeletion(null)).toBe(false);
  });
});

