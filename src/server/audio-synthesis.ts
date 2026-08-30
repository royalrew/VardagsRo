import OpenAI from "openai";

import { openAIConfig } from "@/server/config";
import { AppError } from "@/server/errors";

let ttsClient: OpenAI | null = null;
let ttsClientKey = "";

function getTTSClient(): OpenAI | null {
  const config = openAIConfig();
  if (!config) return null;
  if (!ttsClient || ttsClientKey !== config.apiKey) {
    ttsClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: 60_000,
      maxRetries: 1,
    });
    ttsClientKey = config.apiKey;
  }
  return ttsClient;
}

export type JarvisVoiceName =
  | "onyx"
  | "alloy"
  | "echo"
  | "fable"
  | "nova"
  | "shimmer";

/**
 * Cleans markdown formatting symbols from text to make speech sound natural
 */
export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/[*_~`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Synthesizes speech using OpenAI TTS. Default voice is 'onyx' (deep, authoritative Jarvis persona).
 */
export async function synthesizeJarvisSpeech(
  rawText: string,
  options: {
    voice?: JarvisVoiceName;
    format?: "mp3" | "opus" | "aac" | "flac";
    speed?: number;
  } = {},
): Promise<Buffer> {
  const client = getTTSClient();
  if (!client) {
    throw new AppError(
      503,
      "OPENAI_NOT_CONFIGURED",
      "OpenAI API är inte konfigurerat för röstsyntes.",
    );
  }

  const cleanedText = cleanTextForSpeech(rawText);
  if (!cleanedText) {
    throw new AppError(400, "EMPTY_TEXT", "Text saknas för röstsyntes.");
  }

  // OpenAI TTS limit is 4096 characters per request
  const truncatedText = cleanedText.slice(0, 4000);

  const voice = options.voice || "onyx";
  const format = options.format || "mp3";
  const speed = options.speed || 1.0;

  const response = await client.audio.speech.create({
    model: "tts-1",
    voice,
    input: truncatedText,
    response_format: format,
    speed,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
