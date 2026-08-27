import { afterEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

import { loadDashboard } from "@/server/database";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dashboard database fallback", () => {
  it("fails closed when production has no database configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FAMILY_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");

    await expect(loadDashboard(TEST_ACTOR)).rejects.toMatchObject({
      status: 503,
      code: "DATABASE_NOT_CONFIGURED",
    });
  });

  it("retains local demo data for development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FAMILY_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");

    await expect(loadDashboard(TEST_ACTOR)).resolves.toMatchObject({
      householdId: "household-demo",
      dataMode: "demo",
    });
  });
});
