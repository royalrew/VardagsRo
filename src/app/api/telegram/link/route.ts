import { requireActor, assertCanMutate } from "@/server/actor";
import { telegramConfig } from "@/server/config";
import {
  consumeTelegramLinkRequest,
  listTelegramAccounts,
  loadDashboard,
  removeTelegramAccount,
} from "@/server/database";
import { AppError } from "@/server/errors";
import { apiError, json } from "@/server/http";
import { readJsonMutation } from "@/server/request-security";
import { telegramLinkSchema, telegramUnlinkSchema } from "@/server/schemas";
import { sendTelegramMessage } from "@/server/telegram";
import {
  hashTelegramLinkCode,
  normalizeTelegramLinkCode,
} from "@/server/telegram-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const config = telegramConfig();
    return json({
      configured: Boolean(config),
      botUsername: config?.username ?? null,
      accounts: config ? await listTelegramAccounts(actor) : [],
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const config = telegramConfig();
    if (!config) throw new AppError(503, "TELEGRAM_NOT_CONFIGURED", "Telegram är inte konfigurerat.");
    const input = telegramLinkSchema.parse(await readJsonMutation(request));
    const code = normalizeTelegramLinkCode(input.code);
    if (!code) throw new AppError(400, "INVALID_LINK_CODE", "Koden ska bestå av åtta siffror.");

    const data = await loadDashboard(actor);
    const person = data.people.find((candidate) => candidate.id === input.personId);
    if (!person) throw new AppError(404, "PERSON_NOT_FOUND", "Familjemedlemmen finns inte.");
    // Adulthood is recorded on the person, not guessed from what the role is called.
    if (person.personType !== "adult") {
      throw new AppError(403, "ADULT_REQUIRED", "Telegram kan bara kopplas till en vuxen.");
    }

    const account = await consumeTelegramLinkRequest(
      actor,
      hashTelegramLinkCode(code, config.webhookSecret),
      person.id,
    );
    if (!account) {
      throw new AppError(400, "LINK_CODE_EXPIRED", "Koden är fel eller har gått ut. Skriv /start i Telegram igen.");
    }
    await sendTelegramMessage(
      account.chatId,
      `Klart! Du är nu kopplad som ${account.personName}. Du kan börja fråga om familjens schema.`,
    ).catch(() => undefined);
    return json({ account });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    assertCanMutate(actor);
    const input = telegramUnlinkSchema.parse(await readJsonMutation(request));
    const removed = await removeTelegramAccount(actor, input.personId);
    if (!removed) throw new AppError(404, "TELEGRAM_LINK_NOT_FOUND", "Ingen Telegram-koppling hittades.");
    return json({ removed: true });
  } catch (error) {
    return apiError(error);
  }
}
