import { telegramConfig } from "@/server/config";
import { apiError, json } from "@/server/http";
import { parseTelegramUpdate, processTelegramUpdate } from "@/server/telegram";
import { hasValidTelegramSecret } from "@/server/telegram-security";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const config = telegramConfig();
  if (!config) return json({ error: "Telegram är inte konfigurerat." }, { status: 503 });
  if (
    !hasValidTelegramSecret(
      request.headers.get("x-telegram-bot-api-secret-token"),
      config.webhookSecret,
    )
  ) {
    return json({ error: "Obehörig." }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) {
    return json({ error: "För stor begäran." }, { status: 413 });
  }

  try {
    const update = parseTelegramUpdate(await request.json());
    await processTelegramUpdate(update);
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
