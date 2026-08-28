import { describe, expect, it } from "vitest";

import { readNumber } from "@/components/solo-contracts";

describe("reading a number someone typed", () => {
  it("accepts a plain number", () => {
    expect(readNumber("80", "Vikten")).toBe(80);
    expect(readNumber("  9 ", "Sömnen")).toBe(9);
  });

  it("accepts the unit typed after it", () => {
    // What actually happens in a form: the field says kg, so people write kg.
    expect(readNumber("80 kg", "Vikten")).toBe(80);
    expect(readNumber("100kg", "Viktmålet")).toBe(100);
    expect(readNumber("7 tim", "Sömnen")).toBe(7);
    expect(readNumber("7h", "Sömnen")).toBe(7);
  });

  it("accepts a Swedish decimal comma", () => {
    expect(readNumber("6,5", "Sömnen")).toBe(6.5);
    expect(readNumber("96,4 kg", "Vikten")).toBe(96.4);
  });

  it("treats an empty field as nothing said", () => {
    expect(readNumber("", "Vikten")).toBeNull();
    expect(readNumber("   ", "Vikten")).toBeNull();
  });

  it("refuses unreadable input instead of dropping it", () => {
    // The bug this replaces: "80 kg" parsed to NaN, became null, and the day
    // saved without the weight while reporting success.
    expect(() => readNumber("ungefär 80", "Vikten")).toThrow("Vikten");
    expect(() => readNumber("åtti", "Vikten")).toThrow();
  });

  it("names the field it could not read", () => {
    expect(() => readNumber("x", "Viktmålet")).toThrow(/Viktmålet/);
  });
});
