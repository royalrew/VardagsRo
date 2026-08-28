import { beforeEach, describe, expect, it, vi } from "vitest";

const requireActor = vi.hoisted(() => vi.fn());
const serviceReadiness = vi.hoisted(() => vi.fn());

vi.mock("@/server/actor", () => ({ requireActor }));
vi.mock("@/server/readiness", () => ({ serviceReadiness }));

import { GET } from "@/app/api/health/route";
import { AppError } from "@/server/errors";

describe("GET /api/health", () => {
  beforeEach(() => {
    requireActor.mockReset();
    requireActor.mockResolvedValue({ userId: "user-1" });
    serviceReadiness.mockReset();
  });

  it("refuses an anonymous request before reading service details", async () => {
    requireActor.mockRejectedValue(
      new AppError(401, "NOT_AUTHENTICATED", "Authentication required."),
    );

    const response = await GET(new Request("http://localhost/api/health"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "NOT_AUTHENTICATED" });
    expect(serviceReadiness).not.toHaveBeenCalled();
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

    const request = new Request("http://localhost/api/health", {
      headers: { cookie: "vardagsro.session_token=test" },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(requireActor).toHaveBeenCalledWith(request);
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
