import { describe, expect, it } from "vitest";

import type { Project100MediaItem } from "@/lib/project100-media";
import { calculateBodyComparison } from "@/lib/project100-body-compare";

function makePhoto(id: string, capturedOn: string): Project100MediaItem {
  return {
    id,
    category: "body",
    capturedOn,
    caption: null,
    sessionId: null,
    sessionTitle: null,
    width: 600,
    height: 800,
    originalBytes: 120000,
    hasPreview: true,
    previewUrl: `https://storage.test/${id}.jpg`,
    createdAt: `${capturedOn}T10:00:00Z`,
  };
}

describe("calculateBodyComparison", () => {
  it("returns null if any photo is missing", () => {
    const photo = makePhoto("p-1", "2026-08-01");
    expect(calculateBodyComparison(null, photo, new Map())).toBeNull();
    expect(calculateBodyComparison(photo, null, new Map())).toBeNull();
  });

  it("calculates positive day difference and weight delta accurately", () => {
    const p1 = makePhoto("p-1", "2026-08-01");
    const p2 = makePhoto("p-2", "2026-08-29");
    const weights = new Map<string, number>([
      ["2026-08-01", 82.5],
      ["2026-08-29", 85.0],
    ]);

    const result = calculateBodyComparison(p1, p2, weights);
    expect(result).toEqual({
      daysDiff: 28,
      weightBeforeKg: 82.5,
      weightAfterKg: 85.0,
      weightDeltaKg: 2.5,
    });
  });

  it("handles missing weight measurements gracefully", () => {
    const p1 = makePhoto("p-1", "2026-08-01");
    const p2 = makePhoto("p-2", "2026-08-10");
    const weights = new Map<string, number>([["2026-08-01", 82.5]]);

    const result = calculateBodyComparison(p1, p2, weights);
    expect(result).toEqual({
      daysDiff: 9,
      weightBeforeKg: 82.5,
      weightAfterKg: null,
      weightDeltaKg: null,
    });
  });

  it("handles negative time difference when photos are reversed", () => {
    const p1 = makePhoto("p-1", "2026-08-29");
    const p2 = makePhoto("p-2", "2026-08-01");
    const weights = new Map<string, number>([
      ["2026-08-01", 82.5],
      ["2026-08-29", 85.0],
    ]);

    const result = calculateBodyComparison(p1, p2, weights);
    expect(result).toEqual({
      daysDiff: -28,
      weightBeforeKg: 85.0,
      weightAfterKg: 82.5,
      weightDeltaKg: -2.5,
    });
  });
});
