import { z } from "zod";

import { requireTelegramActor } from "@/server/actor";
import { synthesizeJarvisSpeech } from "@/server/audio-synthesis";
import { transcribeTelegramVoice } from "@/server/audio-transcription";
import { telegramConfig } from "@/server/config";
import {
  claimTelegramUpdate,
  createTelegramLinkRequest,
  getTelegramAccount,
  loadDashboard,
  releaseTelegramUpdate,
} from "@/server/database";
import { processJarvisAgentMessage } from "@/server/jarvis-agent";
import {
  dispatchDueTelegramReminders,
  ensureReminderTicker,
} from "@/server/jarvis-reminders";
import { answerFamilyQuestion } from "@/server/questions";
import { generateTelegramLinkCode, hashTelegramLinkCode } from "@/server/telegram-security";

const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      text: z.string().max(4_096).optional(),
      voice: z.object({ file_id: z.string(), duration: z.number().optional() }).optional(),
      audio: z.object({ file_id: z.string(), duration: z.number().optional() }).optional(),
      chat: z.object({ id: z.number().int(), type: z.string() }),
      from: z
        .object({
          id: z.number().int().positive(),
          is_bot: z.boolean().optional(),
          first_name: z.string().max(128),
          last_name: z.string().max(128).optional(),
          username: z.string().max(128).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export function parseTelegramUpdate(value: unknown): TelegramUpdate {
  return telegramUpdateSchema.parse(value);
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const config = telegramConfig();
  if (!config) throw new Error("Telegram is not configured");
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4_000) }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Telegram rejected the message");
}

export async function sendTelegramVoice(chatId: string, audioBuffer: Buffer): Promise<void> {
  const config = telegramConfig();
  if (!config) throw new Error("Telegram is not configured");

  const formData = new FormData();
  formData.append("chat_id", chatId);
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" });
  formData.append("voice", blob, "voice.ogg");

  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendVoice`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Telegram rejected the voice message");
}

function command(text: string): string | null {
  const match = /^\/(start|help|whoami)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.exec(text.trim());
  return match?.[1]?.toLocaleLowerCase("en-US") ?? null;
}

export async function processTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const sender = message?.from;
  if (!message || !sender || sender.is_bot || message.chat.type !== "private") return;

  const claimed = await claimTelegramUpdate(update.update_id);
  if (!claimed) return;

  const chatId = String(message.chat.id);
  const userId = String(sender.id);
  try {
    ensureReminderTicker();
    dispatchDueTelegramReminders().catch(() => {});
    const account = await getTelegramAccount(userId);
    const requestedCommand = message.text ? command(message.text) : null;

    if (requestedCommand === "start") {
      if (account) {
        await sendTelegramMessage(
          chatId,
          `Du är redan kopplad som ${account.personName}. Skriv en fråga om familjens schema, eller /help för hjälp.`,
        );
        return;
      }

      const config = telegramConfig();
      if (!config) throw new Error("Telegram is not configured");
      const code = generateTelegramLinkCode();
      await createTelegramLinkRequest({
        codeHash: hashTelegramLinkCode(code, config.webhookSecret),
        userId,
        chatId,
        username: sender.username ?? null,
        displayName: [sender.first_name, sender.last_name].filter(Boolean).join(" "),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      await sendTelegramMessage(
        chatId,
        `Din engångskod är ${code}.\n\nÖppna Vardagsro → Familjeinställningar → Telegram och ange koden. Den gäller i 10 minuter.`,
      );
      return;
    }

    if (!account) {
      await sendTelegramMessage(
        chatId,
        "Botten är inte kopplad till dig ännu. Skriv /start för att få en engångskod.",
      );
      return;
    }

    if (requestedCommand === "help") {
      await sendTelegramMessage(
        chatId,
        "Jag är Jarvis, din personliga digitala kollega.\n\nDu kan skriva eller tala in vad som helst:\n• Frågor & Schema: ”Kolla om jag jobbar den 25e september och lägg in att boka restaurang”\n• Spara minne: ”Jobb - Koden till inkontinensförrådet är 2214” eller ”Bilen - Däck 205/55 R16”\n• Sök i minnet: ”Vad är koden till förrådet?”\n• Dagbok & Mående: ”Kändes bra idag, energi 4 av 5, sov 7 timmar”\n\n/help – visa hjälp\n/whoami – visa din koppling\n/start – kontrollera kopplingen",
      );
      return;
    }
    if (requestedCommand === "whoami") {
      await sendTelegramMessage(chatId, `Du är kopplad som ${account.personName} i Vardagsro.`);
      return;
    }

    let messageText = message.text?.trim() || "";
    const isVoiceInput = Boolean(message.voice || message.audio);

    // If voice or audio message, transcribe with Whisper
    if (!messageText && isVoiceInput) {
      const fileId = message.voice?.file_id || message.audio?.file_id;
      if (fileId) {
        try {
          messageText = await transcribeTelegramVoice(fileId);
        } catch {
          await sendTelegramMessage(
            chatId,
            "Kunde inte transkribera röstmeddelandet. Försök igen eller skriv som text.",
          );
          return;
        }
      }
    }

    if (!messageText) {
      await sendTelegramMessage(
        chatId,
        "Jag kan ta emot text- och röstmeddelanden. Skicka en fråga eller håll in mikrofonen för att tala.",
      );
      return;
    }

    if (messageText.length < 2 || messageText.length > 2_000) {
      await sendTelegramMessage(chatId, "Meddelandet behöver vara mellan 2 och 2 000 tecken.");
      return;
    }

    // The bot reads the household its chat is linked to, through the same
    // permission layer as the browser. It never reaches a household by default.
    const actor = await requireTelegramActor(userId);

    // If adult, run through Jarvis Agentic Brain
    if (actor.personType === "adult") {
      try {
        const agentResult = await processJarvisAgentMessage(actor, messageText, {
          channel: "telegram",
          personName: account.personName,
        });
        await sendTelegramMessage(chatId, agentResult.text);

        // Send voice response if input was a voice note
        if (isVoiceInput) {
          try {
            const voiceBuffer = await synthesizeJarvisSpeech(agentResult.text, {
              voice: "onyx",
              format: "opus",
            });
            await sendTelegramVoice(chatId, voiceBuffer);
          } catch {
            // Silently fall back to text-only if TTS fails
          }
        }
        return;
      } catch {
        // Fall back to general question answering if agent execution encounters an error
      }
    }

    const data = await loadDashboard(actor);
    const answer = await answerFamilyQuestion(messageText, data, actor.personId);
    await sendTelegramMessage(chatId, answer.text);
  } catch (error) {
    await releaseTelegramUpdate(update.update_id).catch(() => undefined);
    throw error;
  }
}
