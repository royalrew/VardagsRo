import { describe, expect, it } from "vitest";

import {
  LANDING_CONTACT,
  LANDING_PRINCIPLES,
  LANDING_STACK,
  LANDING_STEPS,
  landingCopy,
} from "@/components/landing-contracts";

describe("the public page copy", () => {
  it("says something in every slot it renders", () => {
    for (const item of [...LANDING_STEPS, ...LANDING_PRINCIPLES]) {
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.body.trim().length).toBeGreaterThan(20);
    }
    expect(LANDING_STACK.length).toBeGreaterThan(0);
  });

  it("carries no contact details onto a page anyone can read", () => {
    // A public page is indexed and scraped. An address that lands here by
    // accident cannot be taken back once it has been.
    for (const line of landingCopy()) {
      expect(line, line).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(line, line).not.toMatch(/https?:\/\//);
      expect(line, line).not.toMatch(/\+?\d[\d\s-]{7,}\d/);
    }
  });

  it("names no one in the household", () => {
    // The example question used to read "Vad har <ett barn> i morgon?".
    // Quoted speech is where a real name slips in, so every quote is checked on
    // its own: past the opening word, nothing may be capitalised.
    const quotes = landingCopy().flatMap(
      (line) => line.match(/”[^”]*”/g) ?? [],
    );
    expect(quotes.length).toBeGreaterThan(0);
    for (const quote of quotes) {
      const afterFirstWord = quote.replace(/^”\s*\S+\s*/, "");
      expect(afterFirstWord, quote).not.toMatch(/\p{Lu}\p{Ll}+/u);
    }
  });

  it("offers a way in that actually resolves", () => {
    // A portfolio page with a dead link is worse than one with no link, so the
    // shape of every route in is checked rather than assumed.
    expect(LANDING_CONTACT.length).toBeGreaterThan(0);
    for (const link of LANDING_CONTACT) {
      expect(link.label.trim().length).toBeGreaterThan(0);
      expect(link.text.trim().length).toBeGreaterThan(0);
      expect(link.href).toMatch(/^(mailto:[^@\s]+@[^@\s]+\.\w+|https:\/\/\S+)$/);
    }
    const kinds = LANDING_CONTACT.map((link) =>
      link.href.startsWith("mailto:") ? "email" : "web",
    );
    expect(kinds).toContain("email");
    expect(kinds).toContain("web");
  });

  it("still makes the promise the product is built on", () => {
    const copy = landingCopy().join(" ").toLowerCase();
    expect(copy).toContain("granskning");
    expect(copy).toContain("undersköterska");
    expect(copy).toContain("produktion");
  });
});
