import { describe, expect, it } from "vitest";

import { ONBOARDING_VERSION, onboardingStorageKey } from "./onboarding-contracts";

describe("onboarding preference", () => {
  it("is versioned and isolated per household", () => {
    expect(ONBOARDING_VERSION).toBe(1);
    expect(onboardingStorageKey("family one")).toBe(
      "vardagsro:onboarding:v1:family%20one",
    );
    expect(onboardingStorageKey("family-two")).not.toBe(
      onboardingStorageKey("family-three"),
    );
  });
});
