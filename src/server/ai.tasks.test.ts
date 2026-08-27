import { describe, expect, it } from "vitest";

import { normalizeExtractedTaskDueAt } from "@/server/ai";

describe("AI task deadline guard", () => {
  it("keeps only complete, parseable timestamps with an explicit UTC offset", () => {
    expect(normalizeExtractedTaskDueAt("2026-08-25T23:59:00+02:00")).toBe(
      "2026-08-25T23:59:00+02:00",
    );
    expect(normalizeExtractedTaskDueAt("2026-08-25T21:59:00Z")).toBe(
      "2026-08-25T21:59:00Z",
    );
  });

  it("turns missing, relative, or offset-free model dates into no deadline", () => {
    expect(normalizeExtractedTaskDueAt(null)).toBeNull();
    expect(normalizeExtractedTaskDueAt("på tisdag")).toBeNull();
    expect(normalizeExtractedTaskDueAt("2026-08-25")).toBeNull();
    expect(normalizeExtractedTaskDueAt("2026-08-25T23:59:00")).toBeNull();
  });
});
