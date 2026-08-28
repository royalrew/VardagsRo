import { beforeEach, describe, expect, it, vi } from "vitest";

import { actorModuleMock } from "../../../../../test/actor-fixture";
import type { FamilyPerson } from "@/lib/types";

const services = vi.hoisted(() => ({
  loadDashboard: vi.fn(),
  consumeTelegramLinkRequest: vi.fn(),
  listTelegramAccounts: vi.fn(async () => []),
  removeTelegramAccount: vi.fn(),
  sendTelegramMessage: vi.fn(async () => undefined),
}));

vi.mock("@/server/actor", () => actorModuleMock());
vi.mock("@/server/config", () => ({
  telegramConfig: () => ({ botToken: "t", username: "bot", webhookSecret: "hemlighet" }),
  appBaseUrl: () => "http://localhost",
  isProductionRuntime: () => false,
}));
vi.mock("@/server/database", () => services);
vi.mock("@/server/telegram", () => ({ sendTelegramMessage: services.sendTelegramMessage }));

import { POST } from "@/app/api/telegram/link/route";

function person(id: string, name: string, personType: "adult" | "child"): FamilyPerson {
  return {
    id,
    householdId: "household-demo",
    name,
    role: personType === "adult" ? "Mamma" : "Son",
    personType,
    aliases: [],
    initials: name.slice(0, 1),
    color: "#476b5b",
    tint: "#dfece4",
  };
}

function linkRequest(personId: string): Request {
  return new Request("http://localhost/api/telegram/link", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ code: "12345678", personId }),
  });
}

/**
 * The family's own rule, not only a product preference: the children are not
 * allowed to use Telegram. The bot may therefore be linked to an adult and to
 * nobody else, and the check is on `personType` rather than on what the role
 * happens to be called.
 */
describe("Telegram is for the adults in the household", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.loadDashboard.mockResolvedValue({
      people: [person("person-adult", "Nora", "adult"), person("person-child", "Leo", "child")],
    });
    services.consumeTelegramLinkRequest.mockResolvedValue({
      chatId: "1",
      personName: "Nora",
    });
  });

  it("refuses to link the bot to a child", async () => {
    const response = await POST(linkRequest("person-child"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ADULT_REQUIRED" });
    expect(services.consumeTelegramLinkRequest).not.toHaveBeenCalled();
  });

  it("links the bot to an adult", async () => {
    const response = await POST(linkRequest("person-adult"));

    expect(response.status).toBe(200);
    expect(services.consumeTelegramLinkRequest).toHaveBeenCalled();
  });

  it("says the person is missing rather than leaking who is in the household", async () => {
    const response = await POST(linkRequest("person-som-inte-finns"));

    expect(response.status).toBe(404);
    expect(services.consumeTelegramLinkRequest).not.toHaveBeenCalled();
  });
});
