import { describe, expect, it } from "vitest";

import {
  buildDeterministicContentSuggestion,
  CONTENT_STATUS_LABELS,
  PROJECT100_CONTENT_STATUSES,
} from "@/lib/project100-content";

describe("project100-content domain", () => {
  it("has complete Swedish status labels for all statuses", () => {
    for (const status of PROJECT100_CONTENT_STATUSES) {
      expect(CONTENT_STATUS_LABELS[status]).toBeDefined();
      expect(CONTENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("builds deterministic editorial suggestions with real workout and weight context", () => {
    const suggestion = buildDeterministicContentSuggestion({
      recentWorkoutsCount: 4,
      totalWeightDeltaKg: 1.2,
      notableMilestone: "85 kg passerat",
    });

    expect(suggestion.hook).toContain("4 genomförda träningspass");
    expect(suggestion.hook).toContain("+1.2 kg");
    expect(suggestion.titleIdeas.length).toBeGreaterThanOrEqual(3);
    expect(suggestion.suggestedShotlist.length).toBeGreaterThanOrEqual(4);
  });
});
