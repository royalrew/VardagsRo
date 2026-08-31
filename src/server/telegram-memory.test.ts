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
  processJarvisAgentMessage: vi.fn(),
  transcribeTelegramVoice: vi.fn(),
  synthesizeJarvisSpeech: vi.fn(async () => Buffer.from("audio-bytes")),
  logProject100Meal: vi.fn(),
  sql: vi.fn(async () => [{ id: "task-1", title: "Köpa mjölk" }]),
}));

vi.stubGlobal("fetch", vi.fn());

vi.mock("@/server/config", () => ({ telegramConfig: dependencies.telegramConfig }));
vi.mock("@/server/database", () => ({
  getTelegramAccount: dependencies.getTelegramAccount,
  claimTelegramUpdate: dependencies.claimTelegramUpdate,
  releaseTelegramUpdate: dependencies.releaseTelegramUpdate,
  loadDashboard: dependencies.loadDashboard,
  readyClient: vi.fn(async () => dependencies.sql),
}));
vi.mock("@/server/project100-nutrition", () => ({
  logProject100Meal: dependencies.logProject100Meal,
}));
vi.mock("@/server/questions", () => ({
  answerFamilyQuestion: dependencies.answerFamilyQuestion,
}));
vi.mock("@/server/jarvis-agent", () => ({
  processJarvisAgentMessage: dependencies.processJarvisAgentMessage,
}));
vi.mock("@/server/audio-transcription", () => ({
  transcribeTelegramVoice: dependencies.transcribeTelegramVoice,
}));
vi.mock("@/server/audio-synthesis", () => ({
  synthesizeJarvisSpeech: dependencies.synthesizeJarvisSpeech,
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

describe("Telegram Jarvis Voice & Schedule Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    dependencies.getTelegramAccount.mockResolvedValue({
      id: "tel-1",
      personId: "person-1",
      personName: "Jimmy",
      userId: "12345",
      chatId: "chat-999",
      username: "jimmy",
    });
  });

  it("handles voice messages by transcribing and passing to Jarvis Agent", async () => {
    dependencies.transcribeTelegramVoice.mockResolvedValueOnce(
      "Kolla om jag jobbar den 25e september och lägg in att boka bord",
    );
    dependencies.processJarvisAgentMessage.mockResolvedValueOnce({
      text: "God kväll Jimmy! Den 25 september är du ledig. Jag har lagt in en påminnelse om att boka bord.",
      executedActions: ["check_schedule", "create_task"],
    });

    await processTelegramUpdate({
      update_id: 201,
      message: {
        chat: { id: 999, type: "private" },
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        voice: { file_id: "voice_file_abc123", duration: 6 },
      },
    });

    expect(dependencies.transcribeTelegramVoice).toHaveBeenCalledWith("voice_file_abc123");
    expect(dependencies.processJarvisAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", personType: "adult" }),
      "Kolla om jag jobbar den 25e september och lägg in att boka bord",
      expect.objectContaining({ channel: "telegram", personName: "Jimmy" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("God kväll Jimmy! Den 25 september är du ledig."),
      }),
    );
    expect(dependencies.synthesizeJarvisSpeech).toHaveBeenCalledWith(
      "God kväll Jimmy! Den 25 september är du ledig. Jag har lagt in en påminnelse om att boka bord.",
      expect.objectContaining({ voice: "onyx", format: "opus" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendVoice",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("handles memory storage commands from Telegram text", async () => {
    dependencies.processJarvisAgentMessage.mockResolvedValueOnce({
      text: '✅ Sparat under 🏢 Jobb:\n"Koden till inkontinensförrådet är 2214"',
      executedActions: ["save_memory"],
    });

    await processTelegramUpdate({
      update_id: 101,
      message: {
        chat: { id: 999, type: "private" },
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        text: "Jobb - Koden till inkontinensförrådet är 2214",
      },
    });

    expect(dependencies.processJarvisAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", personType: "adult" }),
      "Jobb - Koden till inkontinensförrådet är 2214",
      expect.objectContaining({ channel: "telegram", personName: "Jimmy" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Sparat under 🏢 Jobb"),
      }),
    );
  });

  it("handles conversational greetings", async () => {
    dependencies.processJarvisAgentMessage.mockResolvedValueOnce({
      text: "God kväll Jimmy! Hur kan jag hjälpa dig?",
      executedActions: [],
    });

    await processTelegramUpdate({
      update_id: 102,
      message: {
        chat: { id: 999, type: "private" },
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        text: "Hej Jarvis!",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("God kväll Jimmy! Hur kan jag hjälpa dig?"),
      }),
    );
  });

  it("handles inline button click (cmd:training)", async () => {
    dependencies.processJarvisAgentMessage.mockResolvedValueOnce({
      text: "Idag har du Push Dag 1 inlagt på schemat.",
      executedActions: ["get_todays_workout"],
    });

    await processTelegramUpdate({
      update_id: 301,
      callback_query: {
        id: "cb-1",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: { chat: { id: 999, type: "private" } },
        data: "cmd:training",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/answerCallbackQuery",
      expect.objectContaining({ method: "POST" }),
    );
    expect(dependencies.processJarvisAgentMessage).toHaveBeenCalledWith(
      expect.anything(),
      "Vad ska jag träna idag?",
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Push Dag 1"),
      }),
    );
  });

  it("handles quick protein logging inline button (act:quick_protein)", async () => {
    await processTelegramUpdate({
      update_id: 302,
      callback_query: {
        id: "cb-2",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: { chat: { id: 999, type: "private" } },
        data: "act:quick_protein",
      },
    });

    expect(dependencies.logProject100Meal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Kvällsshake / Kasein",
        proteinG: 35,
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Loggade 35g protein"),
      }),
    );
  });

  it("handles task done button (task:done:task-1)", async () => {
    await processTelegramUpdate({
      update_id: 303,
      callback_query: {
        id: "cb-3",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: {
          message_id: 456,
          chat: { id: 999, type: "private" },
          text: "⏰ Påminnelse från Jarvis: Packa lådor",
        },
        data: "task:done:task-1",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/answerCallbackQuery",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("klarmarkerad"),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/editMessageText",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Klarmarkerad"),
      }),
    );
  });
});
