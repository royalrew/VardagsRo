import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/errors";
import {
  assertTrustedMutationRequest,
  readJsonMutation,
} from "@/server/request-security";

const BASE_URL = "https://www.zickaris.se";

function jsonRequest(
  body: BodyInit = '{"name":"Nora"}',
  headers: HeadersInit = {},
): Request {
  return new Request(`${BASE_URL}/api/events`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function expectAppError(
  operation: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  return expect(operation).rejects.toMatchObject({
    name: "AppError",
    status,
    code,
  }) as Promise<void>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("trusted web mutations", () => {
  it("requires the exact configured Origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_BASE_URL", BASE_URL);

    expect(() =>
      assertTrustedMutationRequest(
        jsonRequest(undefined, { origin: BASE_URL }),
      ),
    ).not.toThrow();

    for (const origin of [
      "https://attacker.example",
      `${BASE_URL}/`,
      "null",
    ]) {
      expect(() =>
        assertTrustedMutationRequest(jsonRequest(undefined, { origin })),
      ).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "INVALID_REQUEST_ORIGIN",
        }),
      );
    }
  });

  it("rejects a missing Origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_BASE_URL", BASE_URL);

    expect(() => assertTrustedMutationRequest(jsonRequest())).toThrowError(
      expect.objectContaining({
        status: 403,
        code: "INVALID_REQUEST_ORIGIN",
      }),
    );
  });

  it("allows a missing Origin for local tools but still blocks supplied foreign origins", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VARDAGSRO_BASE_URL", "http://localhost:3000");

    const localRequest = new Request("http://localhost:3000/api/events", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(() => assertTrustedMutationRequest(localRequest)).not.toThrow();

    expect(() =>
      assertTrustedMutationRequest(
        new Request("http://localhost:3000/api/events", {
          method: "POST",
          body: "{}",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3001",
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("rejects Sec-Fetch-Site cross-site even with a matching Origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_BASE_URL", BASE_URL);

    expect(() =>
      assertTrustedMutationRequest(
        jsonRequest(undefined, {
          origin: BASE_URL,
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ status: 403, code: "CROSS_SITE_REQUEST" }),
    );
  });
});

describe("readJsonMutation", () => {
  it("accepts application/json with an optional UTF-8 charset and consumes the body once", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VARDAGSRO_BASE_URL", BASE_URL);
    const request = jsonRequest('{"name":"Mikael"}', {
      origin: BASE_URL,
      "content-type": 'Application/JSON; Charset="UTF-8"',
    });

    await expect(readJsonMutation<{ name: string }>(request)).resolves.toEqual({
      name: "Mikael",
    });
    expect(request.bodyUsed).toBe(true);
    await expect(request.text()).rejects.toThrow();
  });

  it.each<[string | undefined, string]>([
    [undefined, "missing"],
    ["text/plain", "text"],
    ["application/json-patch+json", "suffix"],
    ["application/json; boundary=value", "unknown parameter"],
  ])("rejects a non-JSON media type (%s, %s)", async (contentType) => {
    vi.stubEnv("NODE_ENV", "development");
    const headers = new Headers();
    if (contentType) headers.set("content-type", contentType);
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      body: "{}",
      headers,
    });

    await expectAppError(
      readJsonMutation(request),
      415,
      "JSON_CONTENT_TYPE_REQUIRED",
    );
    expect(request.bodyUsed).toBe(false);
  });

  it("enforces the actual streamed byte count instead of trusting Content-Length", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = jsonRequest('{"value":"too large"}', {
      "content-length": "1",
    });

    await expectAppError(
      readJsonMutation(request, { maxBytes: 8 }),
      413,
      "REQUEST_BODY_TOO_LARGE",
    );
    expect(request.bodyUsed).toBe(true);
  });

  it("counts UTF-8 bytes rather than JavaScript characters", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const body = '"å"';
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(body.length);

    await expectAppError(
      readJsonMutation(jsonRequest(body), { maxBytes: body.length }),
      413,
      "REQUEST_BODY_TOO_LARGE",
    );
  });

  it("rejects an oversized declared Content-Length before reading", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = jsonRequest("{}", { "content-length": "1000" });

    await expectAppError(
      readJsonMutation(request, { maxBytes: 20 }),
      413,
      "REQUEST_BODY_TOO_LARGE",
    );
    expect(request.bodyUsed).toBe(false);
  });

  it("returns a safe AppError for malformed JSON", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const operation = readJsonMutation(jsonRequest("{not-json"));

    await expectAppError(operation, 400, "INVALID_JSON");
    await operation.catch((error: unknown) => {
      expect(error).toBeInstanceOf(AppError);
      expect((error as Error).message).toBe("Skicka giltig JSON.");
    });
  });

  it("rejects invalid caller limits", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await expect(
      readJsonMutation(jsonRequest("{}"), { maxBytes: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
