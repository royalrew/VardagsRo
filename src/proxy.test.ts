import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

function request(pathname: string, authorization?: string) {
  return new NextRequest(`https://vardagsro.example${pathname}`, {
    headers: authorization ? { authorization } : undefined,
  });
}

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("staging access proxy", () => {
  it("always lets the exact readiness endpoint through", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "");

    const response = proxy(request("/api/ready"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not exempt readiness subpaths or trailing slashes", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "");

    expect(proxy(request("/api/ready/")).status).toBe(503);
    expect(proxy(request("/api/ready/details")).status).toBe(503);
  });

  it("lets only the exact Telegram webhook bypass Basic Auth", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "familjen");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "hemligt");

    expect(proxy(request("/api/telegram/webhook")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/telegram/webhook/")).status).toBe(401);
    expect(proxy(request("/api/telegram/link")).status).toBe(401);
  });

  it("fails closed in production when credentials are missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "");

    const response = proxy(request("/"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("fails closed when only one credential is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "familjen");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "");

    expect(proxy(request("/api/health")).status).toBe(503);
  });

  it("allows an unconfigured gate during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "");

    const response = proxy(request("/"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("challenges incorrect credentials on UI and API routes", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "familjen");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "hemligt");

    for (const pathname of ["/", "/api/health"]) {
      const response = proxy(request(pathname, basic("familjen", "fel")));

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        'Basic realm="Vardagsro staging", charset="UTF-8"',
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("accepts exact credentials, including UTF-8 and colons in passwords", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "familjen");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "räv:unge");

    const response = proxy(
      request("/api/health", basic("familjen", "räv:unge")),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("uses the documented legacy credentials when primary credentials are absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "");
    vi.stubEnv("ZICKARIS_ADMIN_EMAIL", "familjen@example.se");
    vi.stubEnv("ZICKARIS_ADMIN_PASSWORD", "lokalt-hemligt");

    const response = proxy(
      request(
        "/api/health",
        basic("familjen@example.se", "lokalt-hemligt"),
      ),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("gives complete primary credentials precedence over legacy credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "primar");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "primart-hemligt");
    vi.stubEnv("ZICKARIS_ADMIN_EMAIL", "legacy@example.se");
    vi.stubEnv("ZICKARIS_ADMIN_PASSWORD", "legacy-hemligt");

    expect(
      proxy(request("/", basic("primar", "primart-hemligt"))).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
    expect(
      proxy(request("/", basic("legacy@example.se", "legacy-hemligt")))
        .status,
    ).toBe(401);
  });

  it("does not hide a partial primary configuration with legacy fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_GATE_USERNAME", "primar");
    vi.stubEnv("VARDAGSRO_GATE_PASSWORD", "");
    vi.stubEnv("ZICKARIS_ADMIN_EMAIL", "legacy@example.se");
    vi.stubEnv("ZICKARIS_ADMIN_PASSWORD", "legacy-hemligt");

    expect(
      proxy(request("/", basic("legacy@example.se", "legacy-hemligt")))
        .status,
    ).toBe(503);
  });
});
