import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  generateMorningBriefing: vi.fn(async () => ({ text: "Morgonöversikt" })),
  generateEveningBriefing: vi.fn(async () => ({ text: "Kvällsavstämning" })),
  sql: vi.fn(async (...args: unknown[]) => {
    void args;
    return [{ id: "task-1", title: "Köpa mjölk" }];
  }),
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
vi.mock("@/server/jarvis-briefing", () => ({
  generateMorningBriefing: dependencies.generateMorningBriefing,
  generateEveningBriefing: dependencies.generateEveningBriefing,
}));
vi.mock("@/server/jarvis-reminders", () => ({
  dispatchDueTelegramReminders: vi.fn(async () => ({ dispatchedCount: 0, reminders: [] })),
  ensureReminderTicker: vi.fn(),
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

import {
  EVENING_INLINE_KEYBOARD,
  getTelegramReplyKeyboard,
  MORNING_INLINE_KEYBOARD,
  parseTelegramCallbackAction,
  processTelegramUpdate,
  taskReminderInlineKeyboard,
} from "@/server/telegram";

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
    dependencies.sql.mockResolvedValue([{ id: "task-1", title: "Köpa mjölk" }]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("keeps every inline callback within Telegram's 64-byte limit and routes it", () => {
    const taskId = "123e4567-e89b-12d3-a456-426614174000";
    const keyboards = [
      MORNING_INLINE_KEYBOARD,
      EVENING_INLINE_KEYBOARD,
      taskReminderInlineKeyboard(taskId),
    ];
    const callbackData = keyboards.flatMap((keyboard) =>
      keyboard.inline_keyboard.flatMap((row) => row.map((button) => button.callback_data)),
    );

    expect(callbackData).toHaveLength(7);
    for (const data of callbackData) {
      expect(new TextEncoder().encode(data).byteLength).toBeLessThanOrEqual(64);
      expect(parseTelegramCallbackAction(data)).not.toBeNull();
    }
    expect(parseTelegramCallbackAction("task:snooze_tomorrow:")).toBeNull();
    expect(parseTelegramCallbackAction("unknown:button")).toBeNull();
  });

  it("builds all four permanent quick buttons with the current Stockholm briefing label", () => {
    const morning = getTelegramReplyKeyboard(new Date("2026-09-03T08:00:00.000Z"));
    const evening = getTelegramReplyKeyboard(new Date("2026-09-03T18:00:00.000Z"));

    expect(morning.keyboard.flat().map((button) => button.text)).toEqual([
      "🌅 Dagens Briefing",
      "🏋️‍♂️ Dagens Träning",
      "🥩 Protein & Mat",
      "📅 Familjens Schema",
    ]);
    expect(evening.keyboard[0][0].text).toBe("🌙 Kvällens Briefing");
  });

  it.each([
    ["🏋️‍♂️ Dagens Träning", "Vad ska jag träna idag?"],
    ["🥩 Protein & Mat", "Hur mycket protein har jag ätit idag och vad finns det för matlådor?"],
    ["📅 Familjens Schema", "Vad händer i familjens schema idag?"],
  ])("routes permanent quick button %s deterministically", async (buttonText, prompt) => {
    dependencies.processJarvisAgentMessage.mockResolvedValueOnce({
      text: `Svar för ${buttonText}`,
      executedActions: [],
    });

    await processTelegramUpdate({
      update_id: 250 + buttonText.length,
      message: {
        chat: { id: 999, type: "private" },
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        text: buttonText,
      },
    });

    expect(dependencies.processJarvisAgentMessage).toHaveBeenCalledWith(
      expect.anything(),
      prompt,
      expect.objectContaining({ channel: "telegram", personName: "Jimmy" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({ body: expect.stringContaining(`Svar för ${buttonText}`) }),
    );
  });

  it("routes the permanent briefing button without depending on AI intent parsing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T18:00:00.000Z"));

    await processTelegramUpdate({
      update_id: 260,
      message: {
        chat: { id: 999, type: "private" },
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        text: "🌙 Kvällens Briefing",
      },
    });

    expect(dependencies.generateEveningBriefing).toHaveBeenCalled();
    expect(dependencies.processJarvisAgentMessage).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({ body: expect.stringContaining("Kvällsavstämning") }),
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

  it("handles inline nutrition button (cmd:nutrition)", async () => {
    dependencies.processJarvisAgentMessage.mockResolvedValueOnce({
      text: "Du har ätit 95 g protein idag.",
      executedActions: ["get_nutrition_status"],
    });

    await processTelegramUpdate({
      update_id: 309,
      callback_query: {
        id: "cb-9",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: { chat: { id: 999, type: "private" } },
        data: "cmd:nutrition",
      },
    });

    expect(dependencies.processJarvisAgentMessage).toHaveBeenCalledWith(
      expect.anything(),
      "Hur mycket protein har jag ätit idag och vad finns det för matlådor?",
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({ body: expect.stringContaining("95 g protein") }),
    );
  });

  it("handles quick protein logging inline button (act:quick_protein)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T22:30:00.000Z"));

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
        eatenOn: "2026-09-04",
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
        body: expect.stringContaining("Bearbetar"),
      }),
    );
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/answerCallbackQuery"))).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/editMessageText",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Klarmarkerad"),
      }),
    );
    const editCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/editMessageText"));
    expect(editCall?.[1]?.body).toContain('"inline_keyboard":[]');
  });

  it("handles task snooze tomorrow button (task:snooze_tomorrow:task-1)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T18:00:00.000Z"));

    await processTelegramUpdate({
      update_id: 304,
      callback_query: {
        id: "cb-4",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: {
          message_id: 457,
          chat: { id: 999, type: "private" },
          text: "⏰ Påminnelse från Jarvis: Packa lådor",
        },
        data: "task:snooze_tomorrow:task-1",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/editMessageText",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Flyttad till imorgon"),
      }),
    );
    const dueAt = dependencies.sql.mock.calls[0]?.[1];
    expect(dueAt).toBeInstanceOf(Date);
    expect((dueAt as unknown as Date).toISOString()).toBe("2026-09-04T06:30:00.000Z");
  });

  it("handles the one-hour snooze button and clears the old reminder marker", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T18:00:00.000Z"));

    await processTelegramUpdate({
      update_id: 305,
      callback_query: {
        id: "cb-5",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: {
          message_id: 458,
          chat: { id: 999, type: "private" },
          text: "⏰ Påminnelse från Jarvis: Packa lådor",
        },
        data: "task:snooze:task-1",
      },
    });

    const sqlCall = dependencies.sql.mock.calls[0] as unknown[];
    expect((sqlCall[0] as TemplateStringsArray).join(" ")).toContain("telegram_reminded");
    expect(sqlCall[1]).toBeInstanceOf(Date);
    expect((sqlCall[1] as Date).toISOString()).toBe("2026-09-03T19:00:00.000Z");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/editMessageText",
      expect.objectContaining({ body: expect.stringContaining("Snoozad i 1 timme") }),
    );
  });

  it("sends a visible fallback when Telegram rejects editing the reminder message", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith("/editMessageText")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ description: "message can't be edited" }),
        } as Response;
      }
      return { ok: true } as Response;
    });

    await processTelegramUpdate({
      update_id: 306,
      callback_query: {
        id: "cb-6",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: {
          message_id: 459,
          chat: { id: 999, type: "private" },
          text: "⏰ Påminnelse från Jarvis: Packa lådor",
        },
        data: "task:snooze:task-1",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({ body: expect.stringContaining("har snoozats i 1 timme") }),
    );
    expect(warning).toHaveBeenCalledWith(
      "Telegram could not edit a callback message:",
      expect.any(Error),
    );
    warning.mockRestore();
  });

  it("never reports success for an already handled or missing task", async () => {
    dependencies.sql.mockResolvedValueOnce([]);

    await processTelegramUpdate({
      update_id: 307,
      callback_query: {
        id: "cb-7",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: {
          message_id: 460,
          chat: { id: 999, type: "private" },
          text: "⏰ Påminnelse från Jarvis: Gammal uppgift",
        },
        data: "task:done:task-1",
      },
    });

    const editCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/editMessageText"));
    expect(editCall?.[1]?.body).toContain("redan hanterad eller finns inte längre");
    expect(editCall?.[1]?.body).not.toContain("Klarmarkerad");
  });

  it("explains unknown or expired callback data instead of silently doing nothing", async () => {
    await processTelegramUpdate({
      update_id: 308,
      callback_query: {
        id: "cb-8",
        from: { id: 12345, first_name: "Jimmy", is_bot: false },
        message: { chat: { id: 999, type: "private" } },
        data: "old:button",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({ body: expect.stringContaining("gammal eller okänd") }),
    );
  });
});
