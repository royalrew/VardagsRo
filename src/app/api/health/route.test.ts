import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceReadiness = vi.hoisted(() => vi.fn());

vi.mock("@/server/readiness", () => ({ serviceReadiness }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    serviceReadiness.mockReset();
  });

  it("returns 503 with safe service states when a required service is missing", async () => {
    serviceReadiness.mockResolvedValue({
      ready: false,
      services: {
        database: "migration_required",
        openai: "not_configured",
        r2: "not_configured",
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "not_ready",
      services: {
        database: "migration_required",
        openai: "not_configured",
        r2: "not_configured",
      },
    });
    expect(JSON.stringify(body)).not.toContain("_KEY");
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(JSON.stringify(body)).not.toContain("postgresql://");
  });
});
