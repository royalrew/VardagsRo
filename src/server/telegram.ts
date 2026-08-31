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
  readyClient,
  releaseTelegramUpdate,
} from "@/server/database";
import { processJarvisAgentMessage } from "@/server/jarvis-agent";
import {
  generateEveningBriefing,
  generateMorningBriefing,
} from "@/server/jarvis-briefing";
import {
  dispatchDueTelegramReminders,
  ensureReminderTicker,
} from "@/server/jarvis-reminders";
import { logProject100Meal } from "@/server/project100-nutrition";
import { answerFamilyQuestion } from "@/server/questions";
import { generateTelegramLinkCode, hashTelegramLinkCode } from "@/server/telegram-security";

export const DEFAULT_TELEGRAM_KEYBOARD = {
  keyboard: [
    [{ text: "🌅 Dagens Briefing" }, { text: "🏋️‍♂️ Dagens Träning" }],
    [{ text: "🥩 Protein & Mat" }, { text: "📅 Familjens Schema" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export const MORNING_INLINE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: "🏋️‍♂️ Dagens Pass", callback_data: "cmd:training" },
      { text: "🍱 Mat & Protein", callback_data: "cmd:nutrition" },
    ],
  ],
};

export const EVENING_INLINE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: "🥩 +35g Protein (Kvällsshake)", callback_data: "act:quick_protein" },
      { text: "🏋️‍♂️ Träningspass", callback_data: "cmd:training" },
    ],
  ],
};

export function taskReminderInlineKeyboard(taskId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✓ Klarmarkera", callback_data: `task:done:${taskId}` },
        { text: "⏰ Snooza 1h", callback_data: `task:snooze:${taskId}` },
      ],
    ],
  };
}

const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      text: z.string().optional(),
      voice: z.object({ file_id: z.string() }).passthrough().optional(),
      audio: z.object({ file_id: z.string() }).passthrough().optional(),
      chat: z.object({ id: z.number() }).passthrough(),
      from: z
        .object({
          id: z.number(),
          is_bot: z.boolean().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          username: z.string().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: z
        .object({
          id: z.number(),
          is_bot: z.boolean().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          username: z.string().optional(),
        })
        .passthrough(),
      message: z
        .object({
          chat: z.object({ id: z.number() }).passthrough().optional(),
          message_id: z.number().optional(),
          text: z.string().optional(),
        })
        .passthrough()
        .optional(),
      data: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export function parseTelegramUpdate(value: unknown): TelegramUpdate {
  return telegramUpdateSchema.parse(value);
}

export interface TelegramSendOptions {
  replyMarkup?: Record<string, unknown>;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: TelegramSendOptions,
): Promise<void> {
  const config = telegramConfig();
  if (!config) throw new Error("Telegram is not configured");
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: text.slice(0, 4_000),
  };
  if (options?.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Telegram rejected the message");
}

export async function editTelegramMessageText(
  chatId: string,
  messageId: number,
  text: string,
  options?: TelegramSendOptions,
): Promise<void> {
  const config = telegramConfig();
  if (!config) return;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4_000),
  };
  if (options?.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  try {
    await fetch(`https://api.telegram.org/bot${config.botToken}/editMessageText`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // ignore
  }
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  const config = telegramConfig();
  if (!config) return;
  try {
    await fetch(`https://api.telegram.org/bot${config.botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text ? text.slice(0, 200) : undefined,
      }),
      cache: "no-store",
    });
  } catch {
    // ignore
  }
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
  const match = /^\/(start|help|whoami|briefing|brief|morgonbrief|kvallsbrief)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.exec(text.trim());
  return match?.[1]?.toLocaleLowerCase("en-US") ?? null;
}

export async function processTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const claimed = await claimTelegramUpdate(update.update_id);
  if (!claimed) return;

  try {
    ensureReminderTicker();
    dispatchDueTelegramReminders().catch(() => {});

    // 1. Handle Callback Queries (Inline Button Clicks)
    if (update.callback_query) {
      const cb = update.callback_query;
      const userId = String(cb.from.id);
      const chatId = String(cb.message?.chat?.id || cb.from.id);

      await answerTelegramCallbackQuery(cb.id);
      const account = await getTelegramAccount(userId);
      if (!account) {
        await sendTelegramMessage(
          chatId,
          "Botten är inte kopplad till dig ännu. Skriv /start för att få en engångskod.",
        );
        return;
      }

      const actor = await requireTelegramActor(userId);
      if (actor.personType !== "adult") return;

      const data = cb.data;

      if (data === "cmd:training") {
        const agentResult = await processJarvisAgentMessage(
          actor,
          "Vad ska jag träna idag?",
          { channel: "telegram", personName: account.personName },
        );
        await sendTelegramMessage(chatId, agentResult.text, {
          replyMarkup: DEFAULT_TELEGRAM_KEYBOARD,
        });
        return;
      }

      if (data === "cmd:nutrition") {
        const agentResult = await processJarvisAgentMessage(
          actor,
          "Hur mycket protein har jag ätit idag och vad finns det för matlådor?",
          { channel: "telegram", personName: account.personName },
        );
        await sendTelegramMessage(chatId, agentResult.text, {
          replyMarkup: DEFAULT_TELEGRAM_KEYBOARD,
        });
        return;
      }

      if (data === "act:quick_protein") {
        const today = new Date().toISOString().slice(0, 10);
        await logProject100Meal(actor, {
          source: "manual",
          title: "Kvällsshake / Kasein",
          eatenOn: today,
          eatenAtMinute: null,
          mealType: "snack",
          proteinG: 35,
          carbsG: null,
          fatG: null,
          kcal: 160,
          hungerBefore: null,
          fullnessAfter: null,
          note: null,
          mediaId: null,
        });
        await sendTelegramMessage(
          chatId,
          "🥩 Loggade 35g protein (Kvällsshake / Kasein) i Projekt 100!",
          { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
        );
        return;
      }

      if (data && data.startsWith("task:done:")) {
        const taskId = data.slice("task:done:".length);
        const sql = await readyClient();
        const res = await sql`
          update family_tasks
          set completed_at = now()
          where id = ${taskId} and household_id = ${actor.householdId}
          returning id, title
        `;
        const title = res[0]?.title || "Uppgiften";
        await answerTelegramCallbackQuery(cb.id, `✓ "${title}" är nu klarmarkerad!`);

        if (cb.message?.message_id) {
          const originalText = cb.message.text || `⏰ Påminnelse: ${title}`;
          await editTelegramMessageText(
            chatId,
            cb.message.message_id,
            `${originalText}\n\n✅ *Klarmarkerad!*`,
          );
        } else {
          await sendTelegramMessage(
            chatId,
            `✓ Uppgiften "${title}" är nu klarmarkerad!`,
            { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
          );
        }
        return;
      }

      if (data && data.startsWith("task:snooze:")) {
        const taskId = data.slice("task:snooze:".length);
        const sql = await readyClient();
        const res = await sql`
          update family_tasks
          set due_at = now() + interval '1 hour',
              notes = regexp_replace(coalesce(notes, ''), '\\[telegram_reminded:[^\\]]+\\]', '', 'g')
          where id = ${taskId} and household_id = ${actor.householdId}
          returning id, title
        `;
        const title = res[0]?.title || "Uppgiften";
        await answerTelegramCallbackQuery(cb.id, `⏰ "${title}" har snoozats i 1 timme.`);

        if (cb.message?.message_id) {
          const originalText = cb.message.text || `⏰ Påminnelse: ${title}`;
          await editTelegramMessageText(
            chatId,
            cb.message.message_id,
            `${originalText}\n\n⏰ *Snoozad 1 timme*`,
          );
        } else {
          await sendTelegramMessage(
            chatId,
            `⏰ Påminnelsen för "${title}" har snoozats i 1 timme.`,
            { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
          );
        }
        return;
      }

      return;
    }

    // 2. Handle Messages
    const message = update.message;
    const sender = message?.from;
    if (!message || !sender || sender.is_bot || message.chat.type !== "private") return;

    const chatId = String(message.chat.id);
    const userId = String(sender.id);
    const account = await getTelegramAccount(userId);
    const requestedCommand = message.text ? command(message.text) : null;

    if (requestedCommand === "start") {
      if (account) {
        await sendTelegramMessage(
          chatId,
          `Du är redan kopplad som ${account.personName}. Välj en snabbknapp nedan eller skriv en fråga till Jarvis.`,
          { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
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
        "Jag är Jarvis, din personliga digitala kollega.\n\nDu kan skriva, tala in röstmeddelanden eller använda snabbknapparna:\n• 🌅 Dagens Briefing – morgonöversikt eller kvällsavstämning\n• 🏋️‍♂️ Dagens Träning – pass, övningar och status\n• 🥩 Protein & Mat – dagsintag, matlådor och proteinmål\n• 📅 Familjens Schema – arbetspass och aktiviteter\n\nDu kan även skriva påminnelser som ”Påminn mig att köpa mjölk på fredag efter jobbet”.",
        { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
      );
      return;
    }
    if (requestedCommand === "whoami") {
      await sendTelegramMessage(
        chatId,
        `Du är kopplad som ${account.personName} i Vardagsro.`,
        { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
      );
      return;
    }

    // The bot reads the household its chat is linked to, through the same
    // permission layer as the browser. It never reaches a household by default.
    const actor = await requireTelegramActor(userId);

    // Direct /briefing slash command support
    if (
      requestedCommand === "briefing" ||
      requestedCommand === "brief" ||
      requestedCommand === "morgonbrief" ||
      requestedCommand === "kvallsbrief"
    ) {
      if (actor.personType === "adult") {
        const isEvening =
          requestedCommand === "kvallsbrief" ||
          (requestedCommand !== "morgonbrief" && new Date().getHours() >= 17);
        const briefing = isEvening
          ? await generateEveningBriefing(actor, { callerName: account.personName })
          : await generateMorningBriefing(actor, { callerName: account.personName });
        await sendTelegramMessage(chatId, briefing.text, {
          replyMarkup: isEvening ? EVENING_INLINE_KEYBOARD : MORNING_INLINE_KEYBOARD,
        });
        return;
      }
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
            { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
          );
          return;
        }
      }
    }

    if (!messageText) {
      await sendTelegramMessage(
        chatId,
        "Jag kan ta emot text- och röstmeddelanden. Skicka en fråga eller håll in mikrofonen för att tala.",
        { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
      );
      return;
    }

    if (messageText.length < 2 || messageText.length > 2_000) {
      await sendTelegramMessage(
        chatId,
        "Meddelandet behöver vara mellan 2 och 2 000 tecken.",
        { replyMarkup: DEFAULT_TELEGRAM_KEYBOARD },
      );
      return;
    }

    // If adult, run through Jarvis Agentic Brain
    if (actor.personType === "adult") {
      try {
        const agentResult = await processJarvisAgentMessage(actor, messageText, {
          channel: "telegram",
          personName: account.personName,
        });

        const isBriefingResponse = agentResult.executedActions.includes("get_daily_briefing");
        const replyMarkup = isBriefingResponse
          ? new Date().getHours() >= 17
            ? EVENING_INLINE_KEYBOARD
            : MORNING_INLINE_KEYBOARD
          : DEFAULT_TELEGRAM_KEYBOARD;

        await sendTelegramMessage(chatId, agentResult.text, { replyMarkup });

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
    await sendTelegramMessage(chatId, answer.text, {
      replyMarkup: DEFAULT_TELEGRAM_KEYBOARD,
    });
  } catch (error) {
    await releaseTelegramUpdate(update.update_id).catch(() => undefined);
    throw error;
  }
}
