export const PROJECT100_MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "shake",
] as const;

export type Project100MealType = (typeof PROJECT100_MEAL_TYPES)[number];

export const PROJECT100_MEAL_TYPE_LABELS: Record<Project100MealType, string> = {
  breakfast: "Frukost",
  lunch: "Lunch",
  dinner: "Middag",
  snack: "Mellanmål",
  shake: "Shake",
};

export const PROJECT100_SUPPLEMENT_KINDS = ["protein", "creatine", "vitamin", "other"] as const;
export type Project100SupplementKind = (typeof PROJECT100_SUPPLEMENT_KINDS)[number];

export const PROJECT100_SUPPLEMENT_KIND_LABELS: Record<Project100SupplementKind, string> = {
  protein: "Proteinpulver",
  creatine: "Kreatin",
  vitamin: "Vitamin",
  other: "Annat",
};

/**
 * Whether the clock matters for a supplement.
 *
 * Creatine is the case worth stating out loud: what decides the effect is the
 * daily amount, not the hour it was taken. Offering a schedule there would be
 * inventing precision, so the app says so instead.
 */
export const PROJECT100_TIMING_MATTERS: Record<Project100SupplementKind, boolean> = {
  protein: true,
  creatine: false,
  vitamin: false,
  other: false,
};

export const PROJECT100_TIMING_NOTES: Record<Project100SupplementKind, string> = {
  protein: "Fyller ut dagen när maten inte räckte hela vägen fram.",
  creatine: "Tidpunkten spelar ingen roll — det är den dagliga mängden som räknas. Ta den när du ändå gör något dagligen.",
  vitamin: "Tidpunkten spelar sällan roll. Häng den på en måltid du ändå äter.",
  other: "Ange en tidpunkt bara om den faktiskt har betydelse.",
};

export interface Project100Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
  kcal: number;
}

export interface Project100Food {
  id: string;
  name: string;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  kcalPer100g: number | null;
  isStaple: boolean;
  stapleTargetGrams: number | null;
}

export interface Project100BatchItem {
  id: string;
  foodId: string;
  name: string;
  grams: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  kcalPer100g: number | null;
}

export interface Project100MealBatch {
  id: string;
  name: string;
  cookedOn: string;
  portionsTotal: number;
  portionsLeft: number;
  note: string | null;
  items: Project100BatchItem[];
}

export interface Project100Meal {
  id: string;
  eatenOn: string;
  eatenAtMinute: number | null;
  mealType: Project100MealType;
  title: string;
  source: "manual" | "batch" | "estimate";
  batchId: string | null;
  portions: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  kcal: number | null;
  hungerBefore: number | null;
  fullnessAfter: number | null;
  note: string | null;
  mediaId: string | null;
  previewUrl: string | null;
}

export interface Project100Supplement {
  id: string;
  name: string;
  kind: Project100SupplementKind;
  doseAmount: number | null;
  doseUnit: "g" | "mg" | "ml" | "st" | null;
  purpose: string | null;
  timingMatters: boolean;
  timingNote: string | null;
}

export type Project100TrainingLoad = "vila" | "lätt" | "normal" | "tung";

export interface Project100ProteinTarget {
  /** Null when nothing can honestly be computed. */
  lowGrams: number | null;
  highGrams: number | null;
  lowPerKg: number;
  highPerKg: number;
  load: Project100TrainingLoad;
  weightKg: number | null;
  weightMeasuredOn: string | null;
  sessionsLast7: number;
  minutesLast7: number;
  overrideGrams: number | null;
  /** What is missing, so the page can say it instead of showing a confident number. */
  missing: "weight" | null;
}

const LOAD_BANDS: Record<Project100TrainingLoad, { low: number; high: number }> = {
  vila: { low: 1.6, high: 1.8 },
  lätt: { low: 1.6, high: 1.9 },
  normal: { low: 1.8, high: 2.1 },
  tung: { low: 2.0, high: 2.2 },
};

export const PROJECT100_LOAD_LABELS: Record<Project100TrainingLoad, string> = {
  vila: "Vilovecka",
  lätt: "Lätt vecka",
  normal: "Normal vecka",
  tung: "Tung vecka",
};

export function trainingLoadFromSessions(sessions: number): Project100TrainingLoad {
  if (sessions <= 0) return "vila";
  if (sessions <= 2) return "lätt";
  if (sessions <= 4) return "normal";
  return "tung";
}

/**
 * The daily protein range.
 *
 * A range, never a single number: the honest reading of the evidence is roughly
 * 1,6–2,2 gram per kilo depending on how hard the week actually was, and a page
 * that prints "163 g" claims a precision the science does not have. The weight
 * used is a logged one — the goal weight is the direction, not the input.
 */
export function buildProject100ProteinTarget(input: {
  weightKg: number | null;
  weightMeasuredOn: string | null;
  sessionsLast7: number;
  minutesLast7: number;
  overrideGrams: number | null;
}): Project100ProteinTarget {
  const load = trainingLoadFromSessions(input.sessionsLast7);
  const band = LOAD_BANDS[load];
  const weightKg = input.weightKg;
  return {
    lowGrams: weightKg === null ? null : Math.round(weightKg * band.low),
    highGrams: weightKg === null ? null : Math.round(weightKg * band.high),
    lowPerKg: band.low,
    highPerKg: band.high,
    load,
    weightKg,
    weightMeasuredOn: input.weightMeasuredOn,
    sessionsLast7: input.sessionsLast7,
    minutesLast7: input.minutesLast7,
    overrideGrams: input.overrideGrams,
    missing: weightKg === null ? "weight" : null,
  };
}

/** What the day is actually aiming at: the user's own number wins over the band. */
export function proteinGoalGrams(target: Project100ProteinTarget): number | null {
  return target.overrideGrams ?? target.lowGrams;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function emptyMacros(): Project100Macros {
  return { proteinG: 0, carbsG: 0, fatG: 0, kcal: 0 };
}

/** Energy from the macros when a food carries no label value of its own. */
function kcalFor(item: Project100BatchItem, grams: number): number {
  const factor = grams / 100;
  if (item.kcalPer100g !== null) return item.kcalPer100g * factor;
  return (
    item.proteinPer100g * 4 * factor +
    item.carbsPer100g * 4 * factor +
    item.fatPer100g * 9 * factor
  );
}

export function batchTotalMacros(items: Project100BatchItem[]): Project100Macros {
  return items.reduce((total, item) => {
    const factor = item.grams / 100;
    return {
      proteinG: total.proteinG + item.proteinPer100g * factor,
      carbsG: total.carbsG + item.carbsPer100g * factor,
      fatG: total.fatG + item.fatPer100g * factor,
      kcal: total.kcal + kcalFor(item, item.grams),
    };
  }, emptyMacros());
}

export function batchPortionMacros(batch: Project100MealBatch): Project100Macros {
  const total = batchTotalMacros(batch.items);
  const portions = batch.portionsTotal > 0 ? batch.portionsTotal : 1;
  return {
    proteinG: round1(total.proteinG / portions),
    carbsG: round1(total.carbsG / portions),
    fatG: round1(total.fatG / portions),
    kcal: Math.round(total.kcal / portions),
  };
}

export function sumMealMacros(meals: Project100Meal[]): Project100Macros {
  const total = meals.reduce(
    (sum, meal) => ({
      proteinG: sum.proteinG + (meal.proteinG ?? 0),
      carbsG: sum.carbsG + (meal.carbsG ?? 0),
      fatG: sum.fatG + (meal.fatG ?? 0),
      kcal: sum.kcal + (meal.kcal ?? 0),
    }),
    emptyMacros(),
  );
  return {
    proteinG: round1(total.proteinG),
    carbsG: round1(total.carbsG),
    fatG: round1(total.fatG),
    kcal: Math.round(total.kcal),
  };
}

export interface Project100MealSuggestion {
  id: string;
  kind: "batch" | "shake" | "cook";
  title: string;
  detail: string | null;
  proteinG: number | null;
  /** Never empty. A suggestion that cannot explain itself is not returned. */
  reasons: string[];
}

function hoursUntil(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}

/**
 * What to eat next, and why.
 *
 * Every branch here has to name what it is reading — portions left, protein
 * remaining, the next shift. When nothing grounded can be said the answer is an
 * empty list, because a generic meal idea is noise the reader learns to scroll
 * past, and it would drown the suggestions that do mean something.
 */
export function buildProject100MealSuggestions(input: {
  target: Project100ProteinTarget;
  eatenProteinG: number;
  batches: Project100MealBatch[];
  supplements: Project100Supplement[];
  nextWorkInMinutes: number | null;
}): Project100MealSuggestion[] {
  const goal = proteinGoalGrams(input.target);
  const remaining = goal === null ? null : Math.max(0, Math.round(goal - input.eatenProteinG));
  const open = input.batches.filter((batch) => batch.portionsLeft >= 1);
  const portionsLeft = open.reduce((total, batch) => total + Math.floor(batch.portionsLeft), 0);
  const suggestions: Project100MealSuggestion[] = [];

  const workReason =
    input.nextWorkInMinutes !== null && input.nextWorkInMinutes <= 6 * 60
      ? `arbetspasset börjar om ${hoursUntil(input.nextWorkInMinutes)}`
      : null;

  if (remaining !== null && remaining >= 20 && open.length > 0) {
    // The portion that gets closest without being wildly more than is left.
    const ranked = [...open].sort((left, right) => {
      const leftProtein = batchPortionMacros(left).proteinG;
      const rightProtein = batchPortionMacros(right).proteinG;
      return Math.abs(leftProtein - remaining) - Math.abs(rightProtein - remaining);
    });
    const best = ranked[0];
    const macros = batchPortionMacros(best);
    suggestions.push({
      id: `batch-${best.id}`,
      kind: "batch",
      title: `En portion ${best.name}`,
      detail: `${macros.proteinG} g protein · ${macros.carbsG} g kolhydrater · ${macros.kcal} kcal`,
      proteinG: macros.proteinG,
      reasons: [
        `${Math.floor(best.portionsLeft)} portioner kvar`,
        `${remaining} g protein kvar idag`,
        ...(workReason ? [workReason] : []),
      ],
    });
  }

  const powder = input.supplements.find((supplement) => supplement.kind === "protein");
  if (remaining !== null && remaining >= 15 && powder) {
    suggestions.push({
      id: `shake-${powder.id}`,
      kind: "shake",
      title: `En shake ${powder.name.toLocaleLowerCase("sv-SE")}`,
      detail:
        powder.doseAmount !== null && powder.doseUnit !== null
          ? `Din dos: ${powder.doseAmount} ${powder.doseUnit}`
          : null,
      proteinG: null,
      reasons: [`${remaining} g protein kvar idag`, `du har ${powder.name} hemma`],
    });
  }

  if (portionsLeft < 2 && input.nextWorkInMinutes !== null && input.nextWorkInMinutes <= 48 * 60) {
    suggestions.push({
      id: "cook-batch",
      kind: "cook",
      title: "Laga en sats innan nästa arbetspass",
      detail:
        "Stek en sats kyckling med kolhydrater och grönsaker, dela i portioner och frys in.",
      proteinG: null,
      reasons: [
        portionsLeft === 0 ? "inga portioner kvar" : `bara ${portionsLeft} portion kvar`,
        `nästa arbetspass om ${hoursUntil(input.nextWorkInMinutes)}`,
      ],
    });
  }

  return suggestions.filter((suggestion) => suggestion.reasons.length > 0);
}

export function formatGrams(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 10) / 10} g`;
}
