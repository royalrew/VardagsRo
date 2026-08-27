import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export function generateTelegramLinkCode(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

export function hashTelegramLinkCode(code: string, secret: string): string {
  return createHash("sha256").update(`${secret}\0${code}`, "utf8").digest("hex");
}

export function normalizeTelegramLinkCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, "");
  return /^\d{8}$/.test(code) ? code : null;
}

export function hasValidTelegramSecret(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

