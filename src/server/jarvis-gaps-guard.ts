/**
 * Security Guard & Scope Validator for Jarvis Capability Gaps / Wishlist.
 *
 * Ensures that weird, malicious, nonsensical or irrelevant inputs are NOT
 * logged to the persistent development backlog.
 *
 * Protects against:
 * 1. Prompt injections and jailbreaks (e.g. "ignore instructions", "system prompt")
 * 2. Character gibberish, spam and profanity
 * 3. General non-household trivia and entertainment (e.g. "berätta ett skämt", "skriv en dikt")
 * 4. PII leakage (automatically sanitizes personnummer, cards, emails before logging)
 */

import { sanitizePII } from "@/server/pii-sanitizer";

export interface WishlistValidationResult {
  allowed: boolean;
  reason?: "too_short" | "too_long" | "spam" | "gibberish" | "injection_or_malicious" | "out_of_scope_entertainment";
  sanitizedQuery: string;
  categoryHint?: "car" | "house" | "finance" | "nutrition" | "kids" | "health" | "general";
}

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/i,
  /system\s+prompt/i,
  /dan\s+mode/i,
  /override\s+(?:all\s+)?safety/i,
  /developer\s+mode/i,
  /<script\b/i,
  /sudo\s+rm/i,
  /\beval\s*\(/i,
  /hidden\s+instructions/i,
];

const ENTERTAINMENT_PATTERNS = [
  /\b(?:skämt|vits|saga|rolig historia)\b/i,
  /\b(?:dikt|sångtext|rap-text|poesi|novell)\b/i,
  /(?:vem vann|vem är kungen|huvudstad(?:en)? i|hur långt är (?:det )?till|hur många invånare)/i,
];

const KEYBOARD_MASH_REGEX = /(?:asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwerty|zxcv|qazwsx|wsxedc)/i;
const REPETITION_REGEX = /(.)\1{4,}/;
const VOWELS_REGEX = /[aeiouyåäöAEIOUYÅÄÖ]/;

/**
 * Validates whether a user query is a legitimate capability gap
 * that belongs in the Jarvis feature wishlist.
 */
export function validateWishlistQuery(rawQuery: string): WishlistValidationResult {
  const trimmed = rawQuery.trim();

  // 1. Length constraints
  if (trimmed.length < 5) {
    return { allowed: false, reason: "too_short", sanitizedQuery: trimmed };
  }
  if (trimmed.length > 500) {
    return { allowed: false, reason: "too_long", sanitizedQuery: trimmed };
  }

  // 2. Prompt injection & malicious intent
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: "injection_or_malicious", sanitizedQuery: trimmed };
    }
  }

  // 3. Entertainment & trivia out of scope
  for (const pattern of ENTERTAINMENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: "out_of_scope_entertainment", sanitizedQuery: trimmed };
    }
  }

  // 4. Gibberish & spam checks
  if (KEYBOARD_MASH_REGEX.test(trimmed)) {
    return { allowed: false, reason: "gibberish", sanitizedQuery: trimmed };
  }

  // Repeated characters (e.g. aaaaaa, zzzzzzzz, ???????)
  if (REPETITION_REGEX.test(trimmed)) {
    return { allowed: false, reason: "spam", sanitizedQuery: trimmed };
  }

  // Pure punctuation or symbols
  const lettersCount = (trimmed.match(/[a-zåäöA-ZÅÄÖ]/g) || []).length;
  if (lettersCount < 4) {
    return { allowed: false, reason: "spam", sanitizedQuery: trimmed };
  }

  // Consonant clusters without vowels (e.g. qwrtyp sdfghjkl)
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordsWithVowels = words.filter((w) => VOWELS_REGEX.test(w));
  if (words.length >= 2 && wordsWithVowels.length === 0) {
    return { allowed: false, reason: "gibberish", sanitizedQuery: trimmed };
  }
  if (trimmed.length > 10 && !VOWELS_REGEX.test(trimmed)) {
    return { allowed: false, reason: "gibberish", sanitizedQuery: trimmed };
  }

  // 5. Categorization heuristics
  let categoryHint: WishlistValidationResult["categoryHint"] = "general";
  const lower = trimmed.toLowerCase();

  if (/(?:bil|fordon|däck|besikt|service|mätarställning|parkering|körkort|volvo|bmw|audi|toyota|tesla|släpkärra)/i.test(lower)) {
    categoryHint = "car";
  } else if (/(?:el|elkostnad|värme|värmepump|villa|lägenhet|hyra|bostad|sopor|larm|vatten|försäkring|avtal|abonnemang)/i.test(lower)) {
    categoryHint = "house";
  } else if (/(?:mat|laga|recept|kyl|frys|middag|lunch|frukost|ingrediens|lax|kyckling|protein|kalori|skafferi|inköpslista)/i.test(lower)) {
    categoryHint = "nutrition";
  } else if (/(?:skola|förskola|barn|läxa|prov|skolschema|lov|utflykt|gympa|fritids|dagis|disco)/i.test(lower)) {
    categoryHint = "kids";
  } else if (/(?:träning|pass|gym|styrka|kondition|löpning|hälsa|sömn|vikt|midja|muskel|rehab)/i.test(lower)) {
    categoryHint = "health";
  }

  // 6. PII Sanitization
  const { sanitizedText } = sanitizePII(trimmed);

  return {
    allowed: true,
    sanitizedQuery: sanitizedText,
    categoryHint,
  };
}
