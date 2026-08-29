import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/config", () => ({
  r2Config: () => null,
  demoFallbackAllowed: () => false,
}));

import {
  project100MediaKeyBelongsTo,
  validateProject100Image,
} from "@/server/storage";

const OWNER = "user-nora";
const KEY = `p100/${OWNER}/body/2026/08/0f9d2a1c-7b3e-4a55-9c21-1d4f6b8e0a37.jpg`;

function jpegBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

function pdfBytes(): Uint8Array {
  return new Uint8Array([...Buffer.from("%PDF-1.7\n", "ascii"), 0x0a, 0x0a]);
}

describe("Projekt 100 media keys", () => {
  it("accepts a key that names this owner", () => {
    expect(project100MediaKeyBelongsTo(OWNER, KEY)).toBe(true);
    for (const category of ["body", "food", "training", "content"]) {
      expect(
        project100MediaKeyBelongsTo(OWNER, KEY.replace("/body/", `/${category}/`)),
        category,
      ).toBe(true);
    }
    expect(project100MediaKeyBelongsTo(OWNER, KEY.replace(".jpg", "-preview.jpg"))).toBe(true);
  });

  it("refuses another account's key even when it is otherwise well formed", () => {
    // This is the check that stands between two adults in the same household.
    expect(project100MediaKeyBelongsTo("user-mate", KEY)).toBe(false);
    expect(
      project100MediaKeyBelongsTo(OWNER, KEY.replace(OWNER, "user-mate")),
    ).toBe(false);
  });

  it("refuses a key that is not a Projekt 100 media key at all", () => {
    for (const hostile of [
      "household-demo/documents/2026/08/0f9d2a1c-7b3e-4a55-9c21-1d4f6b8e0a37.jpg",
      `p100/${OWNER}/../body/2026/08/0f9d2a1c-7b3e-4a55-9c21-1d4f6b8e0a37.jpg`,
      `p100/${OWNER}/secrets/2026/08/0f9d2a1c-7b3e-4a55-9c21-1d4f6b8e0a37.jpg`,
      `p100/${OWNER}/body/2026/08/0f9d2a1c-7b3e-4a55-9c21-1d4f6b8e0a37.pdf`,
      `p100/${OWNER}/body/2026/08/not-a-uuid.jpg`,
      "",
    ]) {
      expect(project100MediaKeyBelongsTo(OWNER, hostile), hostile).toBe(false);
    }
  });

  it("refuses an owner segment that does not match the reader exactly", () => {
    // A prefix match would hand `user-nora2` everything `user-nora` owns.
    expect(project100MediaKeyBelongsTo("user-nora2", KEY)).toBe(false);
    expect(project100MediaKeyBelongsTo("user-nor", KEY)).toBe(false);
  });
});

describe("Projekt 100 media uploads", () => {
  it("accepts a real image", () => {
    expect(validateProject100Image(jpegBytes(), "image/jpeg")).toBe("image/jpeg");
  });

  it("refuses a PDF, which a document may be but a memory is not", () => {
    expect(() => validateProject100Image(pdfBytes(), "application/pdf")).toThrowError(
      /JPG-, PNG- eller WebP-format/,
    );
  });

  it("refuses content that does not match what the browser claimed", () => {
    expect(() => validateProject100Image(pdfBytes(), "image/jpeg")).toThrow();
    expect(() => validateProject100Image(new Uint8Array(), "image/jpeg")).toThrow();
  });
});
