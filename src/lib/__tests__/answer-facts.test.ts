import { describe, expect, it } from "vitest";

import { checkTranslationKeepsFacts, factTokens, quotedTitles } from "@/lib/answer-facts";

const SOURCE = "Ja. Mikael – Kvällspass kl. 14.00–22.00 enligt det bekräftade underlaget.";

describe("protecting facts through translation", () => {
  it("picks out the numbers a family would act on", () => {
    expect(factTokens(SOURCE)).toEqual(["14.00", "22.00"]);
    expect(factTokens("Provet är om 5 dagar, den 29 augusti")).toEqual(["5", "29"]);
  });

  it("picks out quoted calendar titles", () => {
    expect(quotedTitles('Jag hittade ”Engelskaprov”, men deadline saknas.')).toEqual([
      "Engelskaprov",
    ]);
  });

  it("accepts a translation that keeps every time and title", () => {
    const translated = "Haa. Mikael – Kvällspass 14.00–22.00 sida lagu xaqiijiyay.";
    expect(checkTranslationKeepsFacts(SOURCE, translated).ok).toBe(true);
  });

  it("rejects a translation that drops a time", () => {
    // Losing the end time would leave the family with a shift that has no end.
    const result = checkTranslationKeepsFacts(SOURCE, "Haa. Mikael – Kvällspass 14.00.");
    expect(result.ok).toBe(false);
    expect(result.missingTokens).toContain("22.00");
  });

  it("rejects a translation that changes a time", () => {
    const result = checkTranslationKeepsFacts(SOURCE, "Haa. Mikael – Kvällspass 14.00–23.00.");
    expect(result.ok).toBe(false);
    expect(result.missingTokens).toContain("22.00");
  });

  it("rejects a translation that collapses a repeated number", () => {
    const source = "Två pass klockan 08.00 och 08.00.";
    const result = checkTranslationKeepsFacts(source, "Laba shift 08.00.");
    expect(result.ok).toBe(false);
    expect(result.missingTokens).toContain("08.00");
  });

  it("rejects a translation that translates away a calendar title", () => {
    const source = 'Jag hittade ”Engelskaprov”, men deadline saknas.';
    const result = checkTranslationKeepsFacts(source, "Waxaan helay ”Imtixaanka Ingiriisiga”.");
    expect(result.ok).toBe(false);
    expect(result.missingTitles).toContain("Engelskaprov");
  });

  it("rejects an empty or runaway translation", () => {
    expect(checkTranslationKeepsFacts(SOURCE, "   ").ok).toBe(false);
    expect(checkTranslationKeepsFacts(SOURCE, "x".repeat(SOURCE.length * 4)).ok).toBe(false);
    expect(checkTranslationKeepsFacts("En lång mening om 12 saker.", "12").ok).toBe(false);
  });

  it("accepts an answer with no facts to lose", () => {
    const source = "Jag saknar underlag för att svara säkert.";
    expect(checkTranslationKeepsFacts(source, "Ma haysto xog aan ku jawaabo.").ok).toBe(true);
  });
});
