import OpenAI from "openai";

import { openAIConfig, telegramConfig } from "@/server/config";
import { AppError } from "@/server/errors";

let whisperClient: OpenAI | null = null;
let whisperClientKey = "";

function getWhisperClient(): OpenAI | null {
  const config = openAIConfig();
  if (!config) return null;
  if (!whisperClient || whisperClientKey !== config.apiKey) {
    whisperClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: 60_000,
      maxRetries: 1,
    });
    whisperClientKey = config.apiKey;
  }
  return whisperClient;
}

export async function transcribeTelegramVoice(fileId: string): Promise<string> {
  const config = telegramConfig();
  if (!config?.botToken) {
    throw new AppError(500, "TELEGRAM_NOT_CONFIGURED", "Telegram-botten är inte konfigurerad.");
  }

  // 1. Get file path from Telegram Bot API
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${config.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
    { cache: "no-store" },
  );

  if (!fileInfoRes.ok) {
    throw new AppError(502, "TELEGRAM_FILE_INFO_FAILED", "Kunde inte hämta filinformation från Telegram.");
  }

  const fileInfoData = (await fileInfoRes.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };

  if (!fileInfoData.ok || !fileInfoData.result?.file_path) {
    throw new AppError(502, "TELEGRAM_FILE_NOT_FOUND", "Ljudfilen hittades inte hos Telegram.");
  }

  const filePath = fileInfoData.result.file_path;

  // 2. Download audio file bytes
  const audioRes = await fetch(
    `https://api.telegram.org/file/bot${config.botToken}/${filePath}`,
    { cache: "no-store" },
  );

  if (!audioRes.ok) {
    throw new AppError(502, "TELEGRAM_DOWNLOAD_FAILED", "Kunde inte ladda ner röstmeddelandet.");
  }

  const audioBuffer = await audioRes.arrayBuffer();
  const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
  const file = new File([audioBlob], "voice.ogg", { type: "audio/ogg" });

  // 3. Transcribe via Whisper
  const ai = getWhisperClient();
  if (!ai) {
    throw new AppError(503, "AI_NOT_CONFIGURED", "OpenAI är inte konfigurerat för ljudtranskribering.");
  }

  const transcription = await ai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "sv",
  });

  return transcription.text.trim();
}
