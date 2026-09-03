import { z } from "zod";

import {
  addCalendarDateDays,
  calendarDateInTimeZone,
  clockValueInTimeZone,
  DEFAULT_TIME_ZONE,
  zonedDateTimeToInstant,
} from "@/lib/dates";
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

export function isEveningTime(now: Date = new Date()): boolean {
  const clockStr = clockValueInTimeZone(now.toISOString(), DEFAULT_TIME_ZONE);
  const hour = parseInt(clockStr.slice(0, 2), 10) || 12;
  return hour >= 17 || hour < 4;
}

export function getTelegramReplyKeyboard(now: Date = new Date()) {
  const isEvening = isEveningTime(now);
  const briefingButtonText = isEvening ? "🌙 Kvällens Briefing" : "🌅 Dagens Briefing";

  return {
    keyboard: [
      [{ text: briefingButtonText }, { text: "🏋️‍♂️ Dagens Träning" }],
      [{ text: "🥩 Protein & Mat" }, { text: "📅 Familjens Schema" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

const TELEGRAM_QUICK_REPLY_PROMPTS = {
  "🏋️‍♂️ Dagens Träning": "Vad ska jag träna idag?",
  "🥩 Protein & Mat": "Hur mycket protein har jag ätit idag och vad finns det för matlådor?",
  "📅 Familjens Schema": "Vad händer i familjens schema idag?",
} as const;

type TelegramQuickReply = keyof typeof TELEGRAM_QUICK_REPLY_PROMPTS;

function quickReplyPrompt(text: string): string | null {
  return Object.prototype.hasOwnProperty.call(TELEGRAM_QUICK_REPLY_PROMPTS, text)
    ? TELEGRAM_QUICK_REPLY_PROMPTS[text as TelegramQuickReply]
    : null;
}

function isBriefingQuickReply(text: string): boolean {
  return text === "🌅 Dagens Briefing" || text === "🌙 Kvällens Briefing";
}

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
        { text: "🌅 Till imorgon (08:30)", callback_data: `task:snooze_tomorrow:${taskId}` },
      ],
      [
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

async function callTelegramApi(
  method: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const config = telegramConfig();
  if (!config) throw new Error("Telegram is not configured");

  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  let apiBody: { ok?: unknown; description?: unknown } | null = null;
  if (typeof response.json === "function") {
    try {
      apiBody = (await response.json()) as { ok?: unknown; description?: unknown };
    } catch {
      // The HTTP status remains authoritative when Telegram returns no JSON.
    }
  }

  if (!response.ok || apiBody?.ok === false) {
    const description = typeof apiBody?.description === "string"
      ? `: ${apiBody.description}`
      : "";
    throw new Error(`Telegram ${method} failed (${response.status})${description}`);
  }
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: TelegramSendOptions,
): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: text.slice(0, 4_000),
  };
  if (options?.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  await callTelegramApi("sendMessage", payload);
}

export async function editTelegramMessageText(
  chatId: string,
  messageId: number,
  text: string,
  options?: TelegramSendOptions,
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4_000),
  };
  if (options?.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  try {
    await callTelegramApi("editMessageText", payload);
    return true;
  } catch (error) {
    console.warn("Telegram could not edit a callback message:", error);
    return false;
  }
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<boolean> {
  try {
    await callTelegramApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text: text ? text.slice(0, 200) : undefined,
    });
    return true;
  } catch (error) {
    console.warn("Telegram could not acknowledge a callback query:", error);
    return false;
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

type TelegramCallbackAction =
  | { kind: "training" }
  | { kind: "nutrition" }
  | { kind: "quick_protein" }
  | { kind: "task_done"; taskId: string }
  | { kind: "task_snooze_tomorrow"; taskId: string }
  | { kind: "task_snooze_hour"; taskId: string };

function validCallbackTaskId(taskId: string): boolean {
  return taskId.length > 0 && taskId.length <= 64 && !/[\s\u0000-\u001f\u007f:]/.test(taskId);
}

export function parseTelegramCallbackAction(data: string | undefined): TelegramCallbackAction | null {
  if (data === "cmd:training") return { kind: "training" };
  if (data === "cmd:nutrition") return { kind: "nutrition" };
  if (data === "act:quick_protein") return { kind: "quick_protein" };

  const taskActions = [
    ["task:snooze_tomorrow:", "task_snooze_tomorrow"],
    ["task:snooze:", "task_snooze_hour"],
    ["task:done:", "task_done"],
  ] as const;

  for (const [prefix, kind] of taskActions) {
    if (!data?.startsWith(prefix)) continue;
    const taskId = data.slice(prefix.length);
    return validCallbackTaskId(taskId) ? { kind, taskId } : null;
  }
  return null;
}

type TelegramCallbackQuery = NonNullable<TelegramUpdate["callback_query"]>;

async function showCallbackResult(
  callback: TelegramCallbackQuery,
  chatId: string,
  originalText: string,
  statusText: string,
  fallbackText: string,
): Promise<void> {
  const edited = callback.message?.message_id
    ? await editTelegramMessageText(
        chatId,
        callback.message.message_id,
        `${originalText}\n\n${statusText}`,
        { replyMarkup: { inline_keyboard: [] } },
      )
    : false;

  if (!edited) {
    await sendTelegramMessage(chatId, fallbackText, {
      replyMarkup: getTelegramReplyKeyboard(),
    });
  }
}

async function showCallbackError(chatId: string): Promise<void> {
  try {
    await sendTelegramMessage(
      chatId,
      "⚠️ Knappen kunde inte genomföras. Inget har bekräftats som ändrat – försök igen eller skriv vad du vill göra till Jarvis.",
      { replyMarkup: getTelegramReplyKeyboard() },
    );
  } catch (error) {
    // The update has already been claimed and may already have mutated data.
    // Logging is safer than asking Telegram to retry the same callback action.
    console.error("Telegram could not send callback failure feedback:", error);
  }
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

      // Telegram keeps a progress spinner visible until the callback is
      // acknowledged. Do this once, immediately, and show the final result in
      // the chat instead of trying to answer the same callback a second time.
      await answerTelegramCallbackQuery(cb.id, "Bearbetar …");

      try {
        const action = parseTelegramCallbackAction(cb.data);
        if (!action) {
          await sendTelegramMessage(
            chatId,
            "Den här snabbknappen är gammal eller okänd. Använd den senaste menyn nedan.",
            { replyMarkup: getTelegramReplyKeyboard() },
          );
          return;
        }

        const account = await getTelegramAccount(userId);
        if (!account) {
          await sendTelegramMessage(
            chatId,
            "Botten är inte kopplad till dig ännu. Skriv /start för att få en engångskod.",
          );
          return;
        }

        const actor = await requireTelegramActor(userId);
        if (actor.personType !== "adult") {
          await sendTelegramMessage(chatId, "Den här snabbknappen är endast tillgänglig för vuxna.");
          return;
        }

        if (action.kind === "training" || action.kind === "nutrition") {
          const prompt = action.kind === "training"
            ? TELEGRAM_QUICK_REPLY_PROMPTS["🏋️‍♂️ Dagens Träning"]
            : TELEGRAM_QUICK_REPLY_PROMPTS["🥩 Protein & Mat"];
          const agentResult = await processJarvisAgentMessage(actor, prompt, {
            channel: "telegram",
            personName: account.personName,
          });
          await sendTelegramMessage(chatId, agentResult.text, {
            replyMarkup: getTelegramReplyKeyboard(),
          });
          return;
        }

        if (action.kind === "quick_protein") {
          const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
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
            { replyMarkup: getTelegramReplyKeyboard() },
          );
          return;
        }

        const sql = await readyClient();
        const originalText = cb.message?.text || "⏰ Påminnelse från Jarvis";

        if (action.kind === "task_done") {
          const rows = await sql<Array<{ id: string; title: string }>>`
            update family_tasks
            set completed_at = now(), updated_at = now()
            where id = ${action.taskId}
              and household_id = ${actor.householdId}
              and person_id = ${actor.personId}
              and completed_at is null
            returning id, title
          `;
          const task = rows[0];
          if (!task) {
            await showCallbackResult(
              cb,
              chatId,
              originalText,
              "ℹ️ Uppgiften är redan hanterad eller finns inte längre.",
              "ℹ️ Uppgiften är redan hanterad eller finns inte längre.",
            );
            return;
          }
          await showCallbackResult(
            cb,
            chatId,
            originalText,
            "✅ Klarmarkerad!",
            `✅ Uppgiften "${task.title}" är nu klarmarkerad!`,
          );
          return;
        }

        const dueAt = action.kind === "task_snooze_tomorrow"
          ? zonedDateTimeToInstant(
              addCalendarDateDays(
                calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE),
                1,
              ),
              8 * 60 + 30,
              DEFAULT_TIME_ZONE,
            )
          : new Date(Date.now() + 60 * 60_000);
        const rows = await sql<Array<{ id: string; title: string }>>`
          update family_tasks
          set due_at = ${dueAt},
              notes = nullif(trim(regexp_replace(coalesce(notes, ''), '\\[telegram_reminded:[^\\]]+\\]', '', 'g')), ''),
              updated_at = now()
          where id = ${action.taskId}
            and household_id = ${actor.householdId}
            and person_id = ${actor.personId}
            and completed_at is null
          returning id, title
        `;
        const task = rows[0];
        if (!task) {
          await showCallbackResult(
            cb,
            chatId,
            originalText,
            "ℹ️ Påminnelsen är redan hanterad eller finns inte längre.",
            "ℹ️ Påminnelsen är redan hanterad eller finns inte längre.",
          );
          return;
        }

        const tomorrow = action.kind === "task_snooze_tomorrow";
        await showCallbackResult(
          cb,
          chatId,
          originalText,
          tomorrow ? "🌅 Flyttad till imorgon kl 08:30." : "⏰ Snoozad i 1 timme.",
          tomorrow
            ? `🌅 Påminnelsen för "${task.title}" har flyttats till imorgon kl 08:30.`
            : `⏰ Påminnelsen för "${task.title}" har snoozats i 1 timme.`,
        );
      } catch (error) {
        console.error(`Telegram callback failed (${cb.data ?? "missing data"}):`, error);
        await showCallbackError(chatId);
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
          { replyMarkup: getTelegramReplyKeyboard() },
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
        { replyMarkup: getTelegramReplyKeyboard() },
      );
      return;
    }
    if (requestedCommand === "whoami") {
      await sendTelegramMessage(
        chatId,
        `Du är kopplad som ${account.personName} i Vardagsro.`,
        { replyMarkup: getTelegramReplyKeyboard() },
      );
      return;
    }

    // The bot reads the household its chat is linked to, through the same
    // permission layer as the browser. It never reaches a household by default.
    const actor = await requireTelegramActor(userId);

    const quickReplyText = message.text?.trim() ?? "";
    const quickPrompt = quickReplyPrompt(quickReplyText);
    if (actor.personType === "adult" && (isBriefingQuickReply(quickReplyText) || quickPrompt)) {
      try {
        if (isBriefingQuickReply(quickReplyText)) {
          const evening = isEveningTime();
          const briefing = evening
            ? await generateEveningBriefing(actor, { callerName: account.personName })
            : await generateMorningBriefing(actor, { callerName: account.personName });
          await sendTelegramMessage(chatId, briefing.text, {
            replyMarkup: evening ? EVENING_INLINE_KEYBOARD : MORNING_INLINE_KEYBOARD,
          });
        } else if (quickPrompt) {
          const agentResult = await processJarvisAgentMessage(actor, quickPrompt, {
            channel: "telegram",
            personName: account.personName,
          });
          await sendTelegramMessage(chatId, agentResult.text, {
            replyMarkup: getTelegramReplyKeyboard(),
          });
        }
      } catch (error) {
        console.error(`Telegram quick reply failed (${quickReplyText}):`, error);
        await sendTelegramMessage(
          chatId,
          "⚠️ Snabbknappen kunde inte hämta sitt innehåll just nu. Försök igen om en stund.",
          { replyMarkup: getTelegramReplyKeyboard() },
        );
      }
      return;
    }

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
          (requestedCommand !== "morgonbrief" && isEveningTime());
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
            { replyMarkup: getTelegramReplyKeyboard() },
          );
          return;
        }
      }
    }

    if (!messageText) {
      await sendTelegramMessage(
        chatId,
        "Jag kan ta emot text- och röstmeddelanden. Skicka en fråga eller håll in mikrofonen för att tala.",
        { replyMarkup: getTelegramReplyKeyboard() },
      );
      return;
    }

    if (messageText.length < 2 || messageText.length > 2_000) {
      await sendTelegramMessage(
        chatId,
        "Meddelandet behöver vara mellan 2 och 2 000 tecken.",
        { replyMarkup: getTelegramReplyKeyboard() },
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
          ? isEveningTime()
            ? EVENING_INLINE_KEYBOARD
            : MORNING_INLINE_KEYBOARD
          : getTelegramReplyKeyboard();

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
      replyMarkup: getTelegramReplyKeyboard(),
    });
  } catch (error) {
    await releaseTelegramUpdate(update.update_id).catch(() => undefined);
    throw error;
  }
}
