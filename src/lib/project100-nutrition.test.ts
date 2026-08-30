import { describe, expect, it } from "vitest";

import {
  batchPortionMacros,
  buildProject100MealSuggestions,
  buildProject100ProteinTarget,
  proteinGoalGrams,
  PROJECT100_TIMING_MATTERS,
  sumMealMacros,
  trainingLoadFromSessions,
  type Project100Meal,
  type Project100MealBatch,
  type Project100Supplement,
} from "@/lib/project100-nutrition";

function batch(overrides: Partial<Project100MealBatch> = {}): Project100MealBatch {
  return {
    id: "batch-1",
    name: "Kyckling, ris och broccoli",
    cookedOn: "2026-08-26",
    portionsTotal: 6,
    portionsLeft: 4,
    note: null,
    items: [
      {
        id: "item-1",
        foodId: "food-chicken",
        name: "Kycklingfilé",
        grams: 1000,
        proteinPer100g: 23,
        carbsPer100g: 0,
        fatPer100g: 1.5,
        kcalPer100g: 110,
      },
      {
        id: "item-2",
        foodId: "food-rice",
        name: "Ris, okokt",
        grams: 400,
        proteinPer100g: 7,
        carbsPer100g: 78,
        fatPer100g: 0.6,
        kcalPer100g: 350,
      },
      {
        id: "item-3",
        foodId: "food-broccoli",
        name: "Broccoli",
        grams: 600,
        proteinPer100g: 2.8,
        carbsPer100g: 4,
        fatPer100g: 0.4,
        kcalPer100g: 34,
      },
    ],
    ...overrides,
  };
}

function meal(proteinG: number | null, overrides: Partial<Project100Meal> = {}): Project100Meal {
  return {
    id: `meal-${proteinG}`,
    eatenOn: "2026-08-26",
    eatenAtMinute: 720,
    mealType: "lunch",
    title: "Lunch",
    source: "manual",
    batchId: null,
    portions: null,
    proteinG,
    carbsG: 40,
    fatG: 10,
    kcal: 500,
    hungerBefore: null,
    fullnessAfter: null,
    note: null,
    mediaId: null,
    previewUrl: null,
    ...overrides,
  };
}

const POWDER: Project100Supplement = {
  id: "supp-1",
  name: "Vassleprotein",
  kind: "protein",
  doseAmount: 30,
  doseUnit: "g",
  purpose: "Fyller ut dagen",
  timingMatters: true,
  timingNote: null,
};

function target(overrides: Parameters<typeof buildProject100ProteinTarget>[0] | null = null) {
  return buildProject100ProteinTarget(
    overrides ?? {
      weightKg: 83.4,
      weightMeasuredOn: "2026-08-26",
      sessionsLast7: 3,
      minutesLast7: 180,
      overrideGrams: null,
    },
  );
}

describe("Projekt 100 protein target", () => {
  it("reads the week's real training as a load band", () => {
    expect(trainingLoadFromSessions(0)).toBe("vila");
    expect(trainingLoadFromSessions(2)).toBe("lätt");
    expect(trainingLoadFromSessions(4)).toBe("normal");
    expect(trainingLoadFromSessions(6)).toBe("tung");
  });

  it("uses logged duration as part of the load instead of only counting taps", () => {
    expect(trainingLoadFromSessions(1, 45)).toBe("lätt");
    expect(trainingLoadFromSessions(1, 150)).toBe("normal");
    expect(trainingLoadFromSessions(2, 320)).toBe("tung");
  });

  it("gives a range, never a single confident number", () => {
    const computed = target();

    expect(computed.lowGrams).toBe(150);
    expect(computed.highGrams).toBe(175);
    expect(computed.lowGrams).toBeLessThan(computed.highGrams as number);
  });

  it("moves the band with how hard the week actually was", () => {
    const rest = target({
      weightKg: 83.4,
      weightMeasuredOn: "2026-08-26",
      sessionsLast7: 0,
      minutesLast7: 0,
      overrideGrams: null,
    });
    const hard = target({
      weightKg: 83.4,
      weightMeasuredOn: "2026-08-26",
      sessionsLast7: 6,
      minutesLast7: 400,
      overrideGrams: null,
    });

    expect(rest.lowGrams).toBeLessThan(hard.lowGrams as number);
    expect(rest.load).toBe("vila");
    expect(hard.load).toBe("tung");
  });

  it("says what is missing rather than showing a number it cannot stand behind", () => {
    const unknown = target({
      weightKg: null,
      weightMeasuredOn: null,
      sessionsLast7: 3,
      minutesLast7: 180,
      overrideGrams: null,
    });

    expect(unknown.lowGrams).toBeNull();
    expect(unknown.highGrams).toBeNull();
    expect(unknown.missing).toBe("weight");
  });

  it("keeps the basis visible so the number can be traced back", () => {
    const computed = target();

    expect(computed.weightKg).toBe(83.4);
    expect(computed.weightMeasuredOn).toBe("2026-08-26");
    expect(computed.sessionsLast7).toBe(3);
    expect(computed.lowPerKg).toBe(1.8);
  });

  it("lets the user's own number win over the computed one", () => {
    const overridden = target({
      weightKg: 83.4,
      weightMeasuredOn: "2026-08-26",
      sessionsLast7: 3,
      minutesLast7: 180,
      overrideGrams: 190,
    });

    expect(proteinGoalGrams(overridden)).toBe(190);
    expect(proteinGoalGrams(target())).toBe(150);
  });
});

describe("Projekt 100 batches", () => {
  it("divides a cooked batch into portions with known macros", () => {
    // 1 kg kyckling, 400 g ris, 600 g broccoli, sex portioner.
    const macros = batchPortionMacros(batch());

    // 230 + 28 + 16,8 = 274,8 g protein, delat på sex portioner.
    expect(macros.proteinG).toBe(45.8);
    expect(macros.carbsG).toBe(56);
    expect(macros.kcal).toBe(451);
  });

  it("uses the label energy when a food carries one and derives it otherwise", () => {
    const derived = batchPortionMacros(
      batch({
        portionsTotal: 1,
        items: [
          {
            id: "item-1",
            foodId: "food-x",
            name: "Okänd",
            grams: 100,
            proteinPer100g: 10,
            carbsPer100g: 20,
            fatPer100g: 5,
            kcalPer100g: null,
          },
        ],
      }),
    );

    // 10*4 + 20*4 + 5*9 = 165
    expect(derived.kcal).toBe(165);
  });

  it("does not divide by zero when a batch claims no portions", () => {
    const macros = batchPortionMacros(batch({ portionsTotal: 0 }));

    expect(Number.isFinite(macros.proteinG)).toBe(true);
  });

  it("adds a day from what the meals actually recorded", () => {
    expect(sumMealMacros([meal(45.1), meal(30), meal(null)]).proteinG).toBe(75.1);
    expect(sumMealMacros([]).proteinG).toBe(0);
  });
});

describe("Projekt 100 meal suggestions", () => {
  const base = {
    target: target(),
    eatenProteinG: 60,
    batches: [batch()],
    supplements: [POWDER],
    nextWorkInMinutes: 180,
  };

  it("offers a portion that is already in the freezer, and says why", () => {
    const [first] = buildProject100MealSuggestions(base);

    expect(first.kind).toBe("batch");
    expect(first.reasons).toContain("4 portioner kvar");
    expect(first.reasons).toContain("90 g protein kvar idag");
    expect(first.reasons).toContain("arbetspasset börjar om 3 h");
  });

  it("offers the powder the user actually has, not a product it invented", () => {
    const shake = buildProject100MealSuggestions(base).find((item) => item.kind === "shake");

    expect(shake?.reasons).toContain("du har Vassleprotein hemma");
    expect(
      buildProject100MealSuggestions({ ...base, supplements: [] }).some(
        (item) => item.kind === "shake",
      ),
    ).toBe(false);
  });

  it("says nothing at all when the day is already covered", () => {
    // No protein left and a full freezer: there is nothing grounded to say, so
    // the page shows nothing rather than a generic meal idea.
    expect(
      buildProject100MealSuggestions({
        ...base,
        eatenProteinG: 200,
        nextWorkInMinutes: null,
      }),
    ).toEqual([]);
  });

  it("asks for a batch to be cooked only when the freezer is running out", () => {
    const empty = buildProject100MealSuggestions({
      ...base,
      batches: [batch({ portionsLeft: 0 })],
      nextWorkInMinutes: 20 * 60,
    });
    const cook = empty.find((item) => item.kind === "cook");

    expect(cook?.reasons).toContain("inga portioner kvar");
    expect(
      buildProject100MealSuggestions(base).some((item) => item.kind === "cook"),
    ).toBe(false);
  });

  it("never returns a suggestion that cannot explain itself", () => {
    for (const suggestion of buildProject100MealSuggestions(base)) {
      expect(suggestion.reasons.length).toBeGreaterThan(0);
    }
  });

  it("stays quiet about protein when no weight has been logged", () => {
    const unknown = buildProject100MealSuggestions({
      ...base,
      target: target({
        weightKg: null,
        weightMeasuredOn: null,
        sessionsLast7: 3,
        minutesLast7: 180,
        overrideGrams: null,
      }),
      nextWorkInMinutes: null,
    });

    expect(unknown.some((item) => item.kind === "batch" || item.kind === "shake")).toBe(false);
  });
});

describe("Projekt 100 supplements", () => {
  it("holds that creatine has no meaningful time of day", () => {
    // The daily amount is what matters. Offering a schedule would be inventing
    // precision, so the model refuses to imply one.
    expect(PROJECT100_TIMING_MATTERS.creatine).toBe(false);
    expect(PROJECT100_TIMING_MATTERS.protein).toBe(true);
  });
});
