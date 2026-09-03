import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

function hasTelegramConfig() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_WEBHOOK_SECRET?.trim() &&
      (process.env.VARDAGSRO_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim()),
  );
}

if (!hasTelegramConfig()) {
  for (const file of [".env.local", ".env.production", ".env.development"]) {
    if (!existsSync(file)) continue;
    loadEnvFile(file);
    if (hasTelegramConfig()) break;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} måste vara satt.`);
  return value;
}

const botToken = required("TELEGRAM_BOT_TOKEN");
const webhookSecret = required("TELEGRAM_WEBHOOK_SECRET");
const baseUrl = process.env.VARDAGSRO_BASE_URL?.trim() || required("BETTER_AUTH_URL");
const webhookUrl = new URL("/api/telegram/webhook", baseUrl).toString();
const telegramApi = `https://api.telegram.org/bot${botToken}`;
const allowedUpdates = ["message", "callback_query"];

const response = await fetch(`${telegramApi}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: allowedUpdates,
  }),
});
const result = await response.json();
if (!response.ok || result.ok !== true) {
  throw new Error(`Telegram avvisade webhooken: ${result.description || response.status}`);
}

const verifyResponse = await fetch(`${telegramApi}/getWebhookInfo`);
const verification = await verifyResponse.json();
const actualUpdates = verification.result?.allowed_updates;
if (
  !verifyResponse.ok ||
  verification.ok !== true ||
  !allowedUpdates.every((update) => actualUpdates?.includes(update))
) {
  throw new Error("Webhooken sparades men Telegram bekräftade inte alla uppdateringstyper.");
}

console.log(
  `Telegram-webhook klar: ${webhookUrl} (${allowedUpdates.join(", ")}).`,
);
