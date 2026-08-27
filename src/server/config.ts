const present = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Local demo data is a development aid, never a production recovery path.
 * Staging demos must be inserted explicitly with the staging seed command.
 */
export function demoFallbackAllowed(): boolean {
  return !isProductionRuntime();
}

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface TelegramConfig {
  botToken: string;
  username: string;
  webhookSecret: string;
}

export function telegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const username = process.env.TELEGRAM_BOT_USERNAME;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!present(botToken) || !present(username) || !present(webhookSecret)) return null;
  return {
    botToken: botToken.trim(),
    username: username.trim().replace(/^@/, ""),
    webhookSecret: webhookSecret.trim(),
  };
}

export function databaseUrl(): string | null {
  const value = process.env.FAMILY_DATABASE_URL ?? process.env.DATABASE_URL;
  return present(value) ? value.trim() : null;
}

export function appBaseUrl(): string {
  const value = process.env.VARDAGSRO_BASE_URL ?? process.env.BETTER_AUTH_URL;
  if (present(value)) return value.trim().replace(/\/$/, "");
  return isProductionRuntime() ? "https://www.zickaris.se" : "http://localhost:3000";
}

export function authSecret(): string {
  const value = process.env.VARDAGSRO_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (present(value) && value.trim().length >= 32) return value.trim();
  if (!isProductionRuntime()) return "vardagsro-local-development-secret-change-me";
  throw new Error("VARDAGSRO_AUTH_SECRET måste vara minst 32 tecken i produktion.");
}

export function openAIConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!present(apiKey)) return null;

  return {
    apiKey: apiKey.trim(),
    model: present(process.env.OPENAI_MODEL)
      ? process.env.OPENAI_MODEL.trim()
      : "gpt-5.6-terra",
  };
}

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpointUrl = process.env.R2_ENDPOINT_URL;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (
    !present(accessKeyId) ||
    !present(secretAccessKey) ||
    !present(bucket) ||
    (!present(endpointUrl) && !present(accountId))
  ) {
    return null;
  }

  return {
    endpoint: present(endpointUrl)
      ? endpointUrl.trim().replace(/\/$/, "")
      : `https://${accountId!.trim()}.r2.cloudflarestorage.com`,
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucket: bucket.trim(),
  };
}

export function configuredServices() {
  return {
    database: databaseUrl() !== null,
    openai: openAIConfig() !== null,
    r2: r2Config() !== null,
    telegram: telegramConfig() !== null,
    auth: present(process.env.VARDAGSRO_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET),
  } as const;
}
