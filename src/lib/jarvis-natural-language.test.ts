import { describe, expect, it } from "vitest";

import {
  isJarvisSpontaneousWorkoutPrompt,
  jarvisTrainingAdaptation,
  parseJarvisBodyState,
  parseJarvisProteinCapture,
  parseJarvisStrengthCapture,
  parseJarvisStrengthCaptures,
} from "@/lib/jarvis-natural-language";

describe("Jarvis natural Swedish capture layer", () => {
  it.each([
    ["Nu gjorde jag 40 knäböj", "Knäböj", 40, 1, 40],
    ["Jag har gjort 40 armhävningar", "Armhävningar", 40, 1, 40],
    ["20 x 2 armhävningar", "Armhävningar", 20, 2, 40],
    ["Jag har gjort 10 gånger 4 armhävningar", "Armhävningar", 10, 4, 40],
    ["Körde 3 set med 12 dips", "Dips", 12, 3, 36],
    ["Tog 15 chins", "Pull-ups", 15, 1, 15],
  ])("parses completed strength phrase %s", (phrase, exerciseName, repsPerSet, setCount, totalReps) => {
    expect(parseJarvisStrengthCapture(phrase)).toEqual({
      exerciseName,
      repsPerSet,
      setCount,
      totalReps,
    });
  });

  it("does not log a planned or hypothetical exercise", () => {
    expect(parseJarvisStrengthCapture("Kan jag göra 40 knäböj?")).toBeNull();
    expect(parseJarvisStrengthCapture("Jag ska göra 20 x 2 armhävningar")).toBeNull();
  });

  it("captures several completed exercises from the same message", () => {
    expect(parseJarvisStrengthCaptures("Nu gjorde jag 40 knäböj och 20 x 2 armhävningar")).toEqual([
      { exerciseName: "Armhävningar", repsPerSet: 20, setCount: 2, totalReps: 40 },
      { exerciseName: "Knäböj", repsPerSet: 40, setCount: 1, totalReps: 40 },
    ]);
  });

  it("rejects implausibly large set notation", () => {
    expect(parseJarvisStrengthCapture("500 x 20 armhävningar")).toBeNull();
  });

  it.each([
    ["Nu drack jag en proteindrink", "Proteinshake", null],
    ["Jag har druckit en proteinshake med 35 g protein", "Proteinshake", 35],
    ["Tog en vassleshake, 42 gram protein", "Proteinshake", 42],
    ["Jag åt kvarg med 24g protein", "Kvarg", 24],
    ["Logga 30g protein", "Proteinmellanmål", 30],
    ["30 g protein", "Proteinmellanmål", 30],
    ["Jag fick i mig 28 g protein", "Proteinmellanmål", 28],
  ])("parses consumed protein phrase %s without inventing values", (phrase, title, proteinG) => {
    expect(parseJarvisProteinCapture(phrase)).toEqual({ title, proteinG });
  });

  it("does not treat a future protein drink as consumed", () => {
    expect(parseJarvisProteinCapture("Jag ska dricka en proteindrink senare")).toBeNull();
  });

  it.each([
    ["Jag har ont i foten", "active", "foot", "foten"],
    ["Nu gör det ont i handleden", "active", "wrist", "handleden"],
    ["Jag känner av knät", "active", "knee", "knät"],
    ["Foten känns bra igen", "resolved", "foot", "foten"],
    ["Jag har inte ont i handleden längre", "resolved", "wrist", "handleden"],
  ])("parses body state %s", (phrase, status, bodyPart, bodyPartLabel) => {
    expect(parseJarvisBodyState(phrase)).toEqual({ status, bodyPart, bodyPartLabel });
  });

  it("recognizes a spontaneous workout request without treating it as a completed session", () => {
    expect(isJarvisSpontaneousWorkoutPrompt("Spontant pass")).toBe(true);
    expect(isJarvisSpontaneousWorkoutPrompt("Jag vill köra ett spontant pass")).toBe(true);
    expect(parseJarvisStrengthCapture("Spontant pass")).toBeNull();
  });

  it("offers non-impact alternatives for a foot limitation", () => {
    const adaptation = jarvisTrainingAdaptation("foot");
    expect(adaptation.avoid).toContain("löpning");
    expect(adaptation.alternatives).toContain("liggande golvpress");
    expect(adaptation.alternatives).toContain("sittande axelpress");
  });
});
