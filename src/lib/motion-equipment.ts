export type TrainingEnvironment =
  | "home"
  | "outdoor_gym"
  | "grass"
  | "forest"
  | "gym"
  | "other";

export type TrainingEquipment =
  | "bodyweight"
  | "wall"
  | "bench_or_chair"
  | "pullup_bar"
  | "low_bar_or_straps"
  | "resistance_band"
  | "dumbbell"
  | "kettlebell"
  | "loaded_backpack"
  | "bicycle";

export type BackpackCarryPosition = "back" | "front_hug" | "goblet_hold" | "other";

export interface LoadedBackpackLoad {
  waterLiters: number;
  bagWeightKg?: number;
  additionalWeightKg?: number;
  measuredTotalKg?: number;
  contentsDescription?: string;
}
export interface LoadedBackpackEstimate {
  estimatedKg: number;
  confidence: "measured" | "estimated";
  breakdown: {
    waterKg: number;
    bagKg: number | null;
    additionalKg: number;
  };
}

export interface LoadedBackpackSafetyCheck {
  contentsSecured: boolean;
  closuresClosed: boolean;
  seamsAndStrapsIntact: boolean;
  canReleaseSafely: boolean;
}

const roundLoad = (value: number): number => Math.round(value * 10) / 10;

/** Water is estimated at 1 kg/litre. A measured total always takes precedence. */
export function estimateLoadedBackpackWeight(load: LoadedBackpackLoad): LoadedBackpackEstimate {
  if (load.measuredTotalKg !== undefined) {
    return {
      estimatedKg: roundLoad(Math.max(0, load.measuredTotalKg)),
      confidence: "measured",
      breakdown: {
        waterKg: roundLoad(Math.max(0, load.waterLiters)),
        bagKg: load.bagWeightKg === undefined ? null : roundLoad(Math.max(0, load.bagWeightKg)),
        additionalKg: roundLoad(Math.max(0, load.additionalWeightKg ?? 0)),
      },
    };
  }

  const waterKg = Math.max(0, load.waterLiters);
  const bagKg = load.bagWeightKg === undefined ? null : Math.max(0, load.bagWeightKg);
  const additionalKg = Math.max(0, load.additionalWeightKg ?? 0);

  return {
    estimatedKg: roundLoad(waterKg + (bagKg ?? 0) + additionalKg),
    confidence: "estimated",
    breakdown: {
      waterKg: roundLoad(waterKg),
      bagKg: bagKg === null ? null : roundLoad(bagKg),
      additionalKg: roundLoad(additionalKg),
    },
  };
}

export function validateLoadedBackpackSetup(check: LoadedBackpackSafetyCheck): {
  safeToRecommend: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!check.contentsSecured) reasons.push("Innehållet måste sitta fast och inte kunna förskjutas.");
  if (!check.closuresClosed) reasons.push("Alla dragkedjor och stängningar måste vara stängda.");
  if (!check.seamsAndStrapsIntact) reasons.push("Sömmar och remmar måste vara hela.");
  if (!check.canReleaseSafely) reasons.push("Lasten måste kunna släppas eller tas av säkert.");

  return { safeToRecommend: reasons.length === 0, reasons };
}

const BACKPACK_COMPATIBILITY: Readonly<Record<string, readonly BackpackCarryPosition[]>> = {
  squat: ["back", "front_hug", "goblet_hold"],
  "goblet-squat": ["front_hug", "goblet_hold"],
  "bulgarian-split-squat": ["back", "front_hug"],
  "reverse-lunge": ["back", "front_hug"],
  "step-up": ["back", "front_hug"],
  "calf-raise": ["back", "front_hug"],
  "hip-bridge": ["front_hug"],
  pushup: ["back"],
};

/** Explicit allow-list: explosive, overhead and free pistol movements are intentionally absent. */
export function isLoadedBackpackCompatible(
  exerciseFamilyId: string,
  carryPosition: BackpackCarryPosition,
): boolean {
  if (carryPosition === "other") return false;
  return BACKPACK_COMPATIBILITY[exerciseFamilyId]?.includes(carryPosition) ?? false;
}
