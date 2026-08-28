import { describe, expect, it } from "vitest";

import { soloActionSchema, soloHealthSchema } from "@/server/schemas";

describe("the solo action schema", () => {
  it("accepts an outward action with evidence and no amount", () => {
    expect(
      soloActionSchema.parse({
        kind: "application_sent",
        occurredOn: "2026-08-26",
        evidence: "Junior utvecklare, Combitech Växjö",
      }),
    ).toMatchObject({ kind: "application_sent", amountOre: null });
  });

  it("refuses an entry nobody could ever check", () => {
    expect(() =>
      soloActionSchema.parse({
        kind: "application_sent",
        occurredOn: "2026-08-26",
        evidence: "  ",
      }),
    ).toThrow();
  });

  it("refuses to let the client set its own experience", () => {
    // The reward has to come from the rule table. A request that can name its
    // own score is a scoreboard that measures typing.
    expect(() =>
      soloActionSchema.parse({
        kind: "outreach_sent",
        occurredOn: "2026-08-26",
        evidence: "Mejl till produktägaren",
        xp: 9_999,
      }),
    ).toThrow();
  });

  it("demands a real amount when money is claimed to have arrived", () => {
    expect(() =>
      soloActionSchema.parse({
        kind: "payment_received",
        occurredOn: "2026-08-26",
        evidence: "Faktura 3 betald",
      }),
    ).toThrow();
    expect(() =>
      soloActionSchema.parse({
        kind: "payment_received",
        occurredOn: "2026-08-26",
        evidence: "Faktura 3 betald",
        amountOre: 0,
      }),
    ).toThrow();
    expect(
      soloActionSchema.parse({
        kind: "payment_received",
        occurredOn: "2026-08-26",
        evidence: "Faktura 3 betald",
        amountOre: 12_500_00,
      }),
    ).toMatchObject({ amountOre: 12_500_00 });
  });

  it("refuses an amount on an action where no money moved", () => {
    expect(() =>
      soloActionSchema.parse({
        kind: "application_sent",
        occurredOn: "2026-08-26",
        evidence: "Ansökan skickad",
        amountOre: 50_000_00,
      }),
    ).toThrow();
  });

  it("rejects a kind that does not carry experience", () => {
    expect(() =>
      soloActionSchema.parse({
        kind: "worked_on_vardagsro",
        occurredOn: "2026-08-26",
        evidence: "Byggde klart readiness-cachen",
      }),
    ).toThrow();
  });

  it("rejects a date that is not a calendar day", () => {
    expect(() =>
      soloActionSchema.parse({
        kind: "outreach_sent",
        occurredOn: "i förrgår",
        evidence: "Mejl till produktägaren",
      }),
    ).toThrow();
  });
});

describe("the solo health schema", () => {
  it("fills in an empty day rather than inventing values", () => {
    expect(soloHealthSchema.parse({ date: "2026-08-28" })).toEqual({
      date: "2026-08-28",
      sleepHours: null,
      workouts: 0,
      weightKg: null,
      energy: null,
      dietHeld: null,
      note: null,
    });
  });

  it("keeps energy on the scale it is asked for", () => {
    expect(() =>
      soloHealthSchema.parse({ date: "2026-08-28", energy: 0 }),
    ).toThrow();
    expect(() =>
      soloHealthSchema.parse({ date: "2026-08-28", energy: 6 }),
    ).toThrow();
    expect(
      soloHealthSchema.parse({ date: "2026-08-28", energy: 3 }),
    ).toMatchObject({ energy: 3 });
  });

  it("refuses impossible sleep and weight", () => {
    expect(() =>
      soloHealthSchema.parse({ date: "2026-08-28", sleepHours: 25 }),
    ).toThrow();
    expect(() =>
      soloHealthSchema.parse({ date: "2026-08-28", weightKg: 0 }),
    ).toThrow();
  });

  it("records whether the day held without asking what was eaten", () => {
    expect(
      soloHealthSchema.parse({ date: "2026-08-28", dietHeld: true }),
    ).toMatchObject({ dietHeld: true });
  });
});
