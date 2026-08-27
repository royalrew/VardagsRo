import { afterEach, describe, expect, it, vi } from "vitest";

import { smtpConfig } from "@/server/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stub(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value ?? "");
  }
}

const complete = {
  SMTP_HOST: "mailcluster.example.se",
  SMTP_USER: "avsandare@example.se",
  SMTP_PASSWORD: "hemligt",
  SMTP_FROM: "avsandare@example.se",
  SMTP_PORT: "587",
};

describe("smtpConfig", () => {
  it("reads a complete configuration", () => {
    stub(complete);

    expect(smtpConfig()).toEqual({
      host: "mailcluster.example.se",
      user: "avsandare@example.se",
      password: "hemligt",
      from: "avsandare@example.se",
      port: 587,
      secure: false,
    });
  });

  it("treats port 465 as implicit TLS and everything else as upgrade-on-connect", () => {
    stub({ ...complete, SMTP_PORT: "465" });
    expect(smtpConfig()?.secure).toBe(true);

    stub({ ...complete, SMTP_PORT: "587" });
    expect(smtpConfig()?.secure).toBe(false);
  });

  it("defaults to the submission port when none is given", () => {
    stub({ ...complete, SMTP_PORT: undefined });

    expect(smtpConfig()?.port).toBe(587);
  });

  it("falls back to the user as sender when no from address is set", () => {
    stub({ ...complete, SMTP_FROM: undefined });

    expect(smtpConfig()?.from).toBe("avsandare@example.se");
  });

  it("is nothing at all when a piece is missing, rather than half configured", () => {
    // Half a configuration would fail at the moment someone is locked out and
    // needs the letter, which is the worst moment to discover it.
    for (const missing of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) {
      stub({ ...complete, [missing]: undefined });
      expect(smtpConfig()).toBeNull();
    }
  });

  it("refuses a port that is not a port", () => {
    stub({ ...complete, SMTP_PORT: "inte-ett-nummer" });
    expect(smtpConfig()).toBeNull();

    stub({ ...complete, SMTP_PORT: "70000" });
    expect(smtpConfig()).toBeNull();
  });
});
