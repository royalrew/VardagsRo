/**
 * PII Sanitization & Sovereign Privacy Layer.
 *
 * Scans, detects, and redacts sensitive personally identifiable information (PII)
 * such as Swedish Personnummer, Credit Cards, Phone numbers, Emails, and Secrets
 * before text is transmitted to external Large Language Models (LLMs).
 *
 * Adheres to OWASP Top 10 for LLMs (LLM06: Sensitive Information Disclosure).
 */

// Swedish Personnummer: 12-digit (YYYYMMDD-XXXX) or 10-digit (YYMMDD-XXXX) with hyphen, plus, or contiguous
const PERSONNUMMER_12_REGEX = /\b(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])[-+]?\d{4}\b/g;
const PERSONNUMMER_10_REGEX = /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])[-+]?\d{4}\b/g;

// Credit Cards: 13-19 digits formatted or contiguous
const CREDIT_CARD_REGEX = /\b(?:\d{4}[ -]?){3}\d{4}\b/g;

// Email addresses
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Swedish Phone numbers (Mobile 07x, Landline 08/0xx, International +46)
const PHONE_SWEDISH_REGEX = /(?:\+46[\s-]?|\b0)(?:7[02369]|8|\d{2})[\s-]?(?:\d{2,3}[\s-]?){2,3}\d{2,4}\b/g;

// API Secrets & Bearer tokens
const SECRETS_REGEX = /\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{5,})\b/g;
const BEARER_REGEX = /Bearer\s+[a-zA-Z0-9._-]+/gi;

/** Redacts Swedish personnummer & samordningsnummer to `[PERSONNUMMER]` */
export function redactPersonnummer(text: string): string {
  return text
    .replace(PERSONNUMMER_12_REGEX, "[PERSONNUMMER]")
    .replace(PERSONNUMMER_10_REGEX, "[PERSONNUMMER]");
}

/** Redacts credit card numbers to `[KORTNUMMER]` */
export function redactCreditCards(text: string): string {
  return text.replace(CREDIT_CARD_REGEX, "[KORTNUMMER]");
}

/** Redacts email addresses to `[E-POST]` */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_REGEX, "[E-POST]");
}

/** Redacts Swedish phone numbers to `[TELEFONNUMMER]` */
export function redactPhoneNumbers(text: string): string {
  return text.replace(PHONE_SWEDISH_REGEX, (match) => {
    // Avoid redacting small 2-digit numbers or simple times
    const digitsOnly = match.replace(/\D/g, "");
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return match;
    return "[TELEFONNUMMER]";
  });
}

/** Redacts API keys, passwords and tokens to `[HEMLIGHET]` */
export function redactSecrets(text: string): string {
  return text
    .replace(BEARER_REGEX, "Bearer [HEMLIGHET]")
    .replace(SECRETS_REGEX, "[HEMLIGHET]");
}

export interface SanitizationResult {
  sanitizedText: string;
  detectedTypes: string[];
}

/**
 * Sanitizes all known sensitive PII types from text before passing to LLMs.
 *
 * @param text The input prompt or document text.
 * @returns The sanitized text along with a list of detected PII types.
 */
export function sanitizePII(text: string): SanitizationResult {
  if (!text || typeof text !== "string") {
    return { sanitizedText: text, detectedTypes: [] };
  }

  const detectedTypes: string[] = [];
  let result = text;

  if (PERSONNUMMER_12_REGEX.test(result) || PERSONNUMMER_10_REGEX.test(result)) {
    detectedTypes.push("personnummer");
    result = redactPersonnummer(result);
  }

  if (CREDIT_CARD_REGEX.test(result)) {
    detectedTypes.push("credit_card");
    result = redactCreditCards(result);
  }

  if (EMAIL_REGEX.test(result)) {
    detectedTypes.push("email");
    result = redactEmails(result);
  }

  if (PHONE_SWEDISH_REGEX.test(result)) {
    const prev = result;
    result = redactPhoneNumbers(result);
    if (result !== prev) detectedTypes.push("phone");
  }

  if (SECRETS_REGEX.test(result) || BEARER_REGEX.test(result)) {
    detectedTypes.push("secret");
    result = redactSecrets(result);
  }

  return {
    sanitizedText: result,
    detectedTypes,
  };
}

/**
 * Checks whether the text contains any sensitive PII (Personnummer, Card, Secret).
 */
export function hasSensitivePII(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return (
    PERSONNUMMER_12_REGEX.test(text) ||
    PERSONNUMMER_10_REGEX.test(text) ||
    CREDIT_CARD_REGEX.test(text) ||
    SECRETS_REGEX.test(text) ||
    BEARER_REGEX.test(text)
  );
}
