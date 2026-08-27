import { describe, expect, it } from "vitest";

import {
  documentOrganizationSchema,
  folderCreateSchema,
  folderUpdateSchema,
} from "@/server/schemas";

describe("document organization schemas", () => {
  it("normalizes folder names and accepts moving to the root", () => {
    expect(folderCreateSchema.parse({ name: "  Skola  ", parentId: null })).toEqual({
      name: "Skola",
      parentId: null,
    });
    expect(folderUpdateSchema.parse({ parentId: null })).toEqual({ parentId: null });
  });

  it("rejects unsafe folder names and empty updates", () => {
    expect(() => folderCreateSchema.parse({ name: "Skola/Brev", parentId: null })).toThrow();
    expect(() => folderCreateSchema.parse({ name: "   ", parentId: null })).toThrow();
    expect(() => folderUpdateSchema.parse({})).toThrow();
  });

  it("only accepts title and folder changes for a document", () => {
    expect(documentOrganizationSchema.parse({ title: "  Veckobrev  ", folderId: null })).toEqual({
      title: "Veckobrev",
      folderId: null,
    });
    expect(() => documentOrganizationSchema.parse({})).toThrow();
    expect(() => documentOrganizationSchema.parse({ storageKey: "client-controlled" })).toThrow();
  });
});
