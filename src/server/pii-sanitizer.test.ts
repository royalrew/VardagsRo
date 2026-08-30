import { describe, expect, it } from "vitest";

import {
  hasSensitivePII,
  redactCreditCards,
  redactEmails,
  redactPersonnummer,
  redactPhoneNumbers,
  redactSecrets,
  sanitizePII,
} from "@/server/pii-sanitizer";

describe("PII Sanitizer Layer", () => {
  describe("Personnummer / Samordningsnummer (Swedish SSN)", () => {
    it("redacts standard 12-digit and 10-digit personnummer with hyphen", () => {
      const input = "Mitt personnummer är 19850612-2384 och min frus är 880315-1234.";
      const result = redactPersonnummer(input);
      expect(result).toBe("Mitt personnummer är [PERSONNUMMER] och min frus är [PERSONNUMMER].");
    });

    it("redacts personnummer without hyphen", () => {
      const input = "Skicka intyget för 199010203456 till kliniken.";
      const result = redactPersonnummer(input);
      expect(result).toBe("Skicka intyget för [PERSONNUMMER] till kliniken.");
    });

    it("redacts plus-separated personnummer for people over 100 years", () => {
      const input = "Patienten är född 19200412+1234.";
      const result = redactPersonnummer(input);
      expect(result).toBe("Patienten är född [PERSONNUMMER].");
    });

    it("does NOT redact normal calendar dates or timestamps", () => {
      const input = "Jag jobbar den 2026-09-25 och mötet är 2026-08-30T10:00:00.";
      const result = redactPersonnummer(input);
      expect(result).toBe(input);
    });

    it("does NOT redact training metrics or body weights", () => {
      const input = "Vägde 80.5 kg och sprang 5 km på 28 minuter.";
      const result = redactPersonnummer(input);
      expect(result).toBe(input);
    });
  });

  describe("Credit Card Numbers (PAN)", () => {
    it("redacts 16-digit credit cards with spaces or hyphens", () => {
      const input1 = "Betala med 4532 0150 1234 5678 tack.";
      const input2 = "Kortnummer: 5412-7512-3412-3456.";
      expect(redactCreditCards(input1)).toBe("Betala med [KORTNUMMER] tack.");
      expect(redactCreditCards(input2)).toBe("Kortnummer: [KORTNUMMER].");
    });

    it("redacts unformatted 16-digit credit cards", () => {
      const input = "Mitt kort är 4532015012345678.";
      expect(redactCreditCards(input)).toBe("Mitt kort är [KORTNUMMER].");
    });
  });

  describe("Email Addresses", () => {
    it("redacts standard email addresses", () => {
      const input = "Kontakta mig på jimmy.svensson@example.com eller info@foretag.se.";
      expect(redactEmails(input)).toBe("Kontakta mig på [E-POST] eller [E-POST].");
    });
  });

  describe("Phone Numbers", () => {
    it("redacts Swedish mobile and landline numbers", () => {
      const input = "Ring mig på 070-123 45 67 eller +46 73 987 65 43.";
      expect(redactPhoneNumbers(input)).toBe("Ring mig på [TELEFONNUMMER] eller [TELEFONNUMMER].");
    });

    it("does NOT redact standard small quantities or times", () => {
      const input = "Jag har 3 barn och passet tar 45 min.";
      expect(redactPhoneNumbers(input)).toBe(input);
    });
  });

  describe("API Secrets & Tokens", () => {
    it("redacts OpenAI API keys and GitHub tokens", () => {
      const input = "Här är min nyckel sk-proj-1234567890abcdef1234567890 och ghp_1234567890abcdef1234567890.";
      expect(redactSecrets(input)).toBe("Här är min nyckel [HEMLIGHET] och [HEMLIGHET].");
    });

    it("redacts Bearer tokens", () => {
      const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID";
      expect(redactSecrets(input)).toBe("Authorization: Bearer [HEMLIGHET]");
    });
  });

  describe("Comprehensive sanitizePII", () => {
    it("sanitizes multiple PII entities in a single prompt before LLM invocation", () => {
      const prompt = "Hej! Mitt personnummer är 19850612-2384, mejl jimmy@test.se, tel 070-123 45 67 och kort 4532 0150 1234 5678. Boka in mig den 2026-09-25.";
      const { sanitizedText, detectedTypes } = sanitizePII(prompt);

      expect(sanitizedText).toBe("Hej! Mitt personnummer är [PERSONNUMMER], mejl [E-POST], tel [TELEFONNUMMER] och kort [KORTNUMMER]. Boka in mig den 2026-09-25.");
      expect(detectedTypes).toContain("personnummer");
      expect(detectedTypes).toContain("email");
      expect(detectedTypes).toContain("phone");
      expect(detectedTypes).toContain("credit_card");
    });

    it("identifies if text contains sensitive PII with hasSensitivePII", () => {
      expect(hasSensitivePII("Hej Jarvis, vad ska vi äta ikväll?")).toBe(false);
      expect(hasSensitivePII("Mitt personnummer är 19850612-2384")).toBe(true);
      expect(hasSensitivePII("Betala till 4532 0150 1234 5678")).toBe(true);
    });
  });
});
