import { describe, expect, it } from "vitest";

import {
  hasValidTelegramSecret,
  hashTelegramLinkCode,
  normalizeTelegramLinkCode,
} from "@/server/telegram-security";

describe("Telegram security", () => {
  it("normalizes only eight-digit one-time codes", () => {
    expect(normalizeTelegramLinkCode("12 34-56 78")).toBe("12345678");
    expect(normalizeTelegramLinkCode("1234567")).toBeNull();
    expect(normalizeTelegramLinkCode("1234567a")).toBeNull();
  });

  it("binds code hashes to the server secret", () => {
    expect(hashTelegramLinkCode("12345678", "secret-a")).not.toBe(
      hashTelegramLinkCode("12345678", "secret-b"),
    );
  });

  it("compares webhook secrets exactly", () => {
    expect(hasValidTelegramSecret("long-random_secret", "long-random_secret")).toBe(true);
    expect(hasValidTelegramSecret("long-random-secret", "long-random_secret")).toBe(false);
    expect(hasValidTelegramSecret(null, "long-random_secret")).toBe(false);
  });
});
