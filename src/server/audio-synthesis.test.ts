import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  openAIConfig: vi.fn(() => ({
    apiKey: "test-openai-key",
    model: "gpt-4o",
    allowed: true,
  })),
  createSpeech: vi.fn(async () => ({
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  })),
}));

vi.mock("@/server/config", () => ({
  openAIConfig: dependencies.openAIConfig,
}));

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      audio = {
        speech: {
          create: dependencies.createSpeech,
        },
      };
    },
  };
});

import {
  cleanTextForSpeech,
  synthesizeJarvisSpeech,
} from "@/server/audio-synthesis";

describe("Jarvis Audio Synthesis (OpenAI TTS)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.openAIConfig.mockReturnValue({
      apiKey: "test-openai-key",
      model: "gpt-4o",
      allowed: true,
    });
  });

  it("cleans markdown symbols from speech text", () => {
    const raw = "God kväll **Jimmy**! Här är [ditt schema](http://link) med *3* punkter:\n# Rubrik";
    const cleaned = cleanTextForSpeech(raw);
    expect(cleaned).toBe("God kväll Jimmy! Här är ditt schema med 3 punkter: Rubrik");
  });

  it("synthesizes speech with onyx voice as default", async () => {
    const buffer = await synthesizeJarvisSpeech("God kväll Jimmy! Den 25 september är du ledig.");

    expect(dependencies.createSpeech).toHaveBeenCalledWith({
      model: "tts-1",
      voice: "onyx",
      input: "God kväll Jimmy! Den 25 september är du ledig.",
      response_format: "mp3",
      speed: 1.0,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBe(4);
  });

  it("allows specifying a custom voice and format", async () => {
    await synthesizeJarvisSpeech("Hej!", { voice: "fable", format: "opus", speed: 1.1 });

    expect(dependencies.createSpeech).toHaveBeenCalledWith({
      model: "tts-1",
      voice: "fable",
      input: "Hej!",
      response_format: "opus",
      speed: 1.1,
    });
  });

  it("throws when OpenAI is not configured", async () => {
    dependencies.openAIConfig.mockReturnValue(null as any);

    await expect(synthesizeJarvisSpeech("Hej")).rejects.toMatchObject({
      code: "OPENAI_NOT_CONFIGURED",
      status: 503,
    });
  });
});
