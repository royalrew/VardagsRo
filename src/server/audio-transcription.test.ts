import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  telegramConfig: vi.fn(() => ({
    botToken: "test-bot-token",
    username: "test_bot",
    webhookSecret: "test-secret",
  })),
  openAIConfig: vi.fn(() => ({
    apiKey: "test-api-key",
    model: "gpt-4o",
  })),
  createTranscription: vi.fn(async () => ({
    text: "Kan du kolla om jag jobbar kväll den 25e september",
  })),
}));

vi.mock("@/server/config", () => ({
  telegramConfig: dependencies.telegramConfig,
  openAIConfig: dependencies.openAIConfig,
}));

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: dependencies.createTranscription,
        },
      },
    })),
  };
});

vi.stubGlobal("fetch", vi.fn());

import { transcribeTelegramVoice } from "@/server/audio-transcription";

describe("audio-transcription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads voice message from Telegram and transcribes via Whisper", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { file_path: "voice/file_123.oga" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      } as Response);

    const result = await transcribeTelegramVoice("voice_file_id_999");
    expect(result).toBe("Kan du kolla om jag jobbar kväll den 25e september");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-bot-token/getFile?file_id=voice_file_id_999",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/file/bottest-bot-token/voice/file_123.oga",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(dependencies.createTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-1",
        language: "sv",
      }),
    );
  });

  it("throws if Telegram getFile fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    await expect(transcribeTelegramVoice("invalid_id")).rejects.toMatchObject({
      code: "TELEGRAM_FILE_INFO_FAILED",
      status: 502,
    });
  });
});
