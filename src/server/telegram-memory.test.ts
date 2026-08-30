import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  sendTelegramMessage: vi.fn(),
  telegramConfig: vi.fn(() => ({
    botToken: "test-token",
    username: "vardagsro_bot",
    webhookSecret: "test-secret",
  })),
  getTelegramAccount: vi.fn(),
  claimTelegramUpdate: vi.fn(async () => true),
  releaseTelegramUpdate: vi.fn(async () => undefined),
  loadDashboard: vi.fn(),
  answerFamilyQuestion: vi.fn(async () => ({ text: "Du jobbar söndag 07:00-16:00" })),
  handleMemoryTextIntent: vi.fn(),
}));

vi.stubGlobal("fetch", vi.fn());

vi.mock("@/server/config", () => ({ telegramConfig: dependencies.telegramConfig }));
vi.mock("@/server/database", () => ({
  getTelegramAccount: dependencies.getTelegramAccount,
  claimTelegramUpdate: dependencies.claimTelegramUpdate,
  releaseTelegramUpdate: dependencies.releaseTelegramUpdate,
  loadDashboard: dependencies.loadDashboard,
}));
vi.mock("@/server/questions", () => ({
  answerFamilyQuestion: dependencies.answerFamilyQuestion,
}));
vi.mock("@/server/project100-memory-assistant", () => ({
  handleMemoryTextIntent: dependencies.handleMemoryTextIntent,
}));
vi.mock("@/server/actor", () => ({
  requireTelegramActor: vi.fn(async () => ({
    userId: "user-1",
    personId: "person-1",
    householdId: "household-1",
    role: "owner",
    personType: "adult",
    canMutate: true,
    channel: "telegram",
  })),
}));

import { processTelegramUpdate } from "@/server/telegram";

describe("Telegram Memory & Schedule Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    dependencies.getTelegramAccount.mockResolvedValue({
      id: "tel-1",
      personId: "person-1",
      personName: "Mikael",
      userId: "12345",
      chatId: "chat-999",
      username: "mikael",
    });
  });

  it("handles memory storage commands from Telegram", async () => {
    dependencies.handleMemoryTextIntent.mockResolvedValueOnce({
      handled: true,
      replyText: '✅ Sparat under 🏢 Jobb:\n"Koden till inkontinensförrådet är 2214"',
      isStore: true,
    });

    await processTelegramUpdate({
      update_id: 101,
      message: {
        chat: { id: 999, type: "private" },
        from: { id: 12345, first_name: "Mikael", is_bot: false },
        text: "Jobb - Koden till inkontinensförrådet är 2214",
      },
    });

    expect(dependencies.handleMemoryTextIntent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", personType: "adult" }),
      "Jobb - Koden till inkontinensförrådet är 2214",
      "telegram",
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chat_id: "999",
          text: '✅ Sparat under 🏢 Jobb:\n"Koden till inkontinensförrådet är 2214"',
        }),
      }),
    );
    expect(dependencies.answerFamilyQuestion).not.toHaveBeenCalled();
  });

  it("handles memory queries from Telegram", async () => {
    dependencies.handleMemoryTextIntent.mockResolvedValueOnce({
      handled: true,
      replyText: "🔑 Sparad uppgift:\n• 🏢 [Jobb] Koden till inkontinensförrådet är 2214",
    });

    await processTelegramUpdate({
      update_id: 102,
      message: {
        chat: { id: 999, type: "private" },
        from: { id: 12345, first_name: "Mikael", is_bot: false },
        text: "Vad är koden till förrådet på jobbet?",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chat_id: "999",
          text: "🔑 Sparad uppgift:\n• 🏢 [Jobb] Koden till inkontinensförrådet är 2214",
        }),
      }),
    );
    expect(dependencies.answerFamilyQuestion).not.toHaveBeenCalled();
  });

  it("falls back to family schedule questions when not a memory intent", async () => {
    dependencies.handleMemoryTextIntent.mockResolvedValueOnce({
      handled: false,
      replyText: "",
    });

    await processTelegramUpdate({
      update_id: 103,
      message: {
        chat: { id: 999, type: "private" },
        from: { id: 12345, first_name: "Mikael", is_bot: false },
        text: "Jobbar jag på söndag?",
      },
    });

    expect(dependencies.handleMemoryTextIntent).toHaveBeenCalled();
    expect(dependencies.answerFamilyQuestion).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chat_id: "999",
          text: "Du jobbar söndag 07:00-16:00",
        }),
      }),
    );
  });
});
