import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configuredServices,
  demoFallbackAllowed,
  r2Config,
} from "@/server/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production configuration", () => {
  it("never enables the local demo fallback in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(demoFallbackAllowed()).toBe(false);
  });

  it("keeps the local fallback available outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(demoFallbackAllowed()).toBe(true);
  });

  it("requires the complete R2 credential set", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "access");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    vi.stubEnv("R2_BUCKET_NAME", "bucket");

    expect(r2Config()).toBeNull();
    expect(configuredServices().r2).toBe(false);
  });
});
