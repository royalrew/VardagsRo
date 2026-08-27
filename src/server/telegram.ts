import { z } from "zod";

import { requireTelegramActor } from "@/server/actor";
import { telegramConfig } from "@/server/config";
import {
  claimTelegramUpdate,
  createTelegramLinkRequest,
  getTelegramAccount,
  loadDashboard,
  releaseTelegramUpdate,
} from "@/server/database";
import { answerFamilyQuestion } from "@/server/questions";
import { generateTelegramLinkCode, hashTelegramLinkCode } from "@/server/telegram-security";

const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      text: z.string().max(4_096).optional(),
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
        "Fråga till exempel: ”Jobbar jag på söndag?”, ”När jobbar Mikael nästa gång?” eller ”När ska blanketten lämnas?”\n\n/help – visa hjälp\n/whoami – visa din koppling\n/start – kontrollera kopplingen",
      );
      return;
    }
    if (requestedCommand === "whoami") {
      await sendTelegramMessage(chatId, `Du är kopplad som ${account.personName} i Vardagsro.`);
      return;
    }
    if (!message.text) {
      await sendTelegramMessage(chatId, "Jag kan läsa textfrågor. Skicka din fråga som ett vanligt meddelande.");
      return;
    }

    const question = message.text.trim();
    if (question.length < 2 || question.length > 1_000) {
      await sendTelegramMessage(chatId, "Frågan behöver vara mellan 2 och 1 000 tecken.");
      return;
    }
    // The bot reads the household its chat is linked to, through the same
    // permission layer as the browser. It never reaches a household by default.
    const actor = await requireTelegramActor(userId);
    const data = await loadDashboard(actor);
    const answer = await answerFamilyQuestion(question, data, actor.personId);
    await sendTelegramMessage(chatId, answer.text);
  } catch (error) {
    await releaseTelegramUpdate(update.update_id).catch(() => undefined);
    throw error;
  }
}
