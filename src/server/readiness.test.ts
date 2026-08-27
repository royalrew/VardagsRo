import { describe, expect, it } from "vitest";

import { readinessFrom } from "@/server/readiness";

describe("service readiness", () => {
  it("is ready only when the migrated database, OpenAI config and R2 are ready", () => {
    expect(
      readinessFrom({
        database: "ok",
        openaiConfigured: true,
        r2Configured: true,
        r2Healthy: true,
      }),
    ).toMatchObject({ ready: true });
  });

  it.each([
    { database: "not_configured" as const, openaiConfigured: true, r2Configured: true, r2Healthy: true },
    { database: "migration_required" as const, openaiConfigured: true, r2Configured: true, r2Healthy: true },
    { database: "empty" as const, openaiConfigured: true, r2Configured: true, r2Healthy: true },
    { database: "ok" as const, openaiConfigured: false, r2Configured: true, r2Healthy: true },
    { database: "ok" as const, openaiConfigured: true, r2Configured: false, r2Healthy: false },
    { database: "ok" as const, openaiConfigured: true, r2Configured: true, r2Healthy: false },
  ])("is not ready for an incomplete dependency state", (input) => {
    expect(readinessFrom(input).ready).toBe(false);
  });
});
