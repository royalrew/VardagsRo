import { beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock } from "../../../../../test/actor-fixture";

const dependencies = vi.hoisted(() => ({
  processTelegramUpdate: vi.fn(),
  telegramConfig: vi.fn(() => ({
    botToken: "token",
    username: "vardagsro_bot",
    webhookSecret: "expected-secret",
  })),
}));

vi.mock("@/server/actor", () => actorModuleMock());
vi.mock("@/server/config", () => ({ telegramConfig: dependencies.telegramConfig }));
vi.mock("@/server/telegram", async () => {
  const actual = await vi.importActual<typeof import("@/server/telegram")>("@/server/telegram");
  return { ...actual, processTelegramUpdate: dependencies.processTelegramUpdate };
});

import { POST } from "@/app/api/telegram/webhook/route";

function request(secret: string | null, body: unknown) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret) headers.set("x-telegram-bot-api-secret-token", secret);
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/telegram/webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing or incorrect Telegram secrets before processing", async () => {
    for (const secret of [null, "wrong-secret"]) {
      const response = await POST(request(secret, { update_id: 1 }));
      expect(response.status).toBe(401);
    }
    expect(dependencies.processTelegramUpdate).not.toHaveBeenCalled();
  });

  it("accepts a valid Telegram update with the exact secret", async () => {
    const response = await POST(request("expected-secret", { update_id: 42 }));
    expect(response.status).toBe(200);
    expect(dependencies.processTelegramUpdate).toHaveBeenCalledWith({ update_id: 42 });
  });
});
