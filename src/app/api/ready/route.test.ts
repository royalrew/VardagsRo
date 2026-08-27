import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceReadiness = vi.hoisted(() => vi.fn());

vi.mock("@/server/readiness", () => ({ serviceReadiness }));

import { GET } from "@/app/api/ready/route";

describe("GET /api/ready", () => {
  beforeEach(() => {
    serviceReadiness.mockReset();
  });

  it("returns a minimal 200 response when dependencies are ready", async () => {
    serviceReadiness.mockResolvedValue({ ready: true, services: {} });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 without exposing dependency or secret details", async () => {
    serviceReadiness.mockResolvedValue({
      ready: false,
      services: {
        database: "unavailable",
        openai: "configured",
        r2: "unavailable",
      },
    });

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ status: "not_ready" });
    expect(text).not.toContain("database");
    expect(text).not.toContain("openai");
    expect(text).not.toContain("r2");
  });
});
