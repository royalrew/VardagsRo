import type { ExerciseType } from "./motion-exercises";
import { getCore24Family, type TrainingGoal } from "./motion-core24";
import {
  estimateLoadedBackpackWeight,
  isLoadedBackpackCompatible,
  validateLoadedBackpackSetup,
  type BackpackCarryPosition,
  type LoadedBackpackLoad,
  type LoadedBackpackSafetyCheck,
  type TrainingEquipment,
} from "./motion-equipment";

export interface SessionPerformance {
  completedAt: string;
  completedReps: number;
  targetReps: number;
  rpe: "easy" | "moderate" | "hard";
  formScorePercent: number; // 0 - 100
}

export interface ExerciseBaseline {
  exercise: ExerciseType;
  baselineReps: number;
  currentWorkingReps: number;
  targetSets: number;
  history: readonly SessionPerformance[];
  level: number;
}

export interface ProgressionSimulationResult {
  finalBaseline: ExerciseBaseline;
  history: readonly SessionPerformance[];
}

export interface GoalAwareProgressionInput {
  exerciseFamilyId: string;
  currentVariationId: string;
  goal: TrainingGoal;
  history: readonly SessionPerformance[];
  stableRangeOfMotion: boolean;
  balanceLimited?: boolean;
  singleLegPrerequisitesMet?: boolean;
  availableEquipment?: readonly TrainingEquipment[];
  backpack?: {
    load: LoadedBackpackLoad;
    safety: LoadedBackpackSafetyCheck;
    carryPosition: BackpackCarryPosition;
  };
}

export interface GoalAwareProgressionRecommendation {
  action: "hold" | "deload" | "add_load" | "harder_variation";
  nextVariationId?: string;
  suggestedLoadIncreaseKg?: readonly [number, number];
  currentExternalLoadKg?: number;
  loadConfidence?: "measured" | "estimated";
  reason: string;
}

function hasTwoProgressionReadySessions(
  history: readonly SessionPerformance[],
  stableRangeOfMotion: boolean,
): boolean {
  if (!stableRangeOfMotion || history.length < 2) return false;
  return history.slice(-2).every((session) =>
    session.completedReps >= session.targetReps
    && session.formScorePercent >= 85
    && (session.rpe === "easy" || session.rpe === "moderate"));
}

function hasTwoStrugglingSessions(history: readonly SessionPerformance[]): boolean {
  if (history.length < 2) return false;
  return history.slice(-2).every((session) =>
    session.rpe === "hard" || session.formScorePercent < 70 || session.completedReps < session.targetReps);
}

function usableBackpack(input: GoalAwareProgressionInput): {
  usable: boolean;
  estimatedKg?: number;
  confidence?: "measured" | "estimated";
  reason?: string;
} {
  if (!input.backpack) return { usable: false };
  const safety = validateLoadedBackpackSetup(input.backpack.safety);
  if (!safety.safeToRecommend) return { usable: false, reason: safety.reasons[0] };
  if (!isLoadedBackpackCompatible(input.exerciseFamilyId, input.backpack.carryPosition)) {
    return { usable: false, reason: "Ryggsäcken är inte godkänd för denna rörelse och bärposition." };
  }
  const load = estimateLoadedBackpackWeight(input.backpack.load);
  return { usable: true, estimatedKg: load.estimatedKg, confidence: load.confidence };
}

/**
 * Recommends the next progression without assuming that the hardest variation is best.
 * Progression requires two repeatable top-range sessions and stable ROM.
 */
export function recommendGoalAwareProgression(
  input: GoalAwareProgressionInput,
): GoalAwareProgressionRecommendation {
  if (hasTwoStrugglingSessions(input.history)) {
    return {
      action: "deload",
      reason: "Två pass i rad visar missade mål, hög ansträngning eller tydligt formtapp. Sänk belastning eller svårighet.",
    };
  }

  if (!hasTwoProgressionReadySessions(input.history, input.stableRangeOfMotion)) {
    return {
      action: "hold",
      reason: "Behåll nivån tills två pass i rad når målreps med stabil ROM och hanterbar ansträngning.",
    };
  }

  if (input.exerciseFamilyId === "squat") {
    if (input.goal === "hypertrophy") {
      const backpack = usableBackpack(input);
      if (backpack.usable) {
        return {
          action: "add_load",
          nextVariationId: "loaded-backpack-squat",
          suggestedLoadIncreaseKg: [1, 2],
          currentExternalLoadKg: backpack.estimatedKg,
          loadConfidence: backpack.confidence,
          reason: "För muskelbyggande prioriteras en liten, mätbar belastningsökning framför att balans gör setet svårare.",
        };
      }

      const equipment = new Set(input.availableEquipment ?? []);
      if (equipment.has("dumbbell") || equipment.has("kettlebell")) {
        return {
          action: "harder_variation",
          nextVariationId: "goblet-squat",
          reason: "Goblet squat ger en stabil och mätbar belastningsprogression för muskelbyggande.",
        };
      }
      if (equipment.has("bench_or_chair")) {
        return {
          action: "harder_variation",
          nextVariationId: "bulgarian-split-squat",
          reason: "En stabil unilateral variant höjer benstimulansen utan att kräva fri pistolbalans.",
        };
      }
      return {
        action: "harder_variation",
        nextVariationId: "tempo-squat",
        reason: backpack.reason ?? "Långsammare tempo och paus ökar svårigheten när säker yttre belastning saknas.",
      };
    }

    if (input.goal === "strength_skill") {
      if (input.balanceLimited) {
        return {
          action: "hold",
          nextVariationId: "supported-bulgarian",
          reason: "Balansen begränsar rörelsen. Bygg stabil enbensstyrka innan fri pistolprogression.",
        };
      }
      if (!input.singleLegPrerequisitesMet) {
        return {
          action: "harder_variation",
          nextVariationId: "bulgarian-split-squat",
          reason: "Bygg kontrollerad unilateral styrka innan assisterad pistol squat.",
        };
      }

      const skillLadder = ["assisted-pistol-to-box", "counterweighted-pistol", "free-pistol"];
      const currentIndex = skillLadder.indexOf(input.currentVariationId);
      const nextVariationId = currentIndex < 0 ? skillLadder[0] : skillLadder[currentIndex + 1];
      if (nextVariationId) {
        return {
          action: "harder_variation",
          nextVariationId,
          reason: "Färdighetsmålet prioriterar stegvis ensidighet och kontroll; varje ny variant ska kalibreras.",
        };
      }
    }
  }

  const family = getCore24Family(input.exerciseFamilyId);
  if (!family) {
    return { action: "hold", reason: "Övningen saknar ännu en verifierad progressionsstege." };
  }

  const equipment = new Set<TrainingEquipment>(["bodyweight", ...(input.availableEquipment ?? [])]);
  const current = family.variations.find((variation) => variation.id === input.currentVariationId);
  const next = family.variations
    .filter((variation) => !current || variation.difficulty > current.difficulty)
    .filter((variation) => variation.equipment.every((item) => item === "bodyweight" || equipment.has(item)))
    .sort((a, b) => a.difficulty - b.difficulty)[0];

  if (!next) {
    return { action: "hold", reason: "Ingen säkrare verifierad progression är tillgänglig med vald utrustning." };
  }

  return {
    action: "harder_variation",
    nextVariationId: next.id,
    reason: "Två stabila pass öppnar nästa tillgängliga, kontrollerade variation.",
  };
}

/**
 * Creates an initial exercise progression baseline.
 *
 * @param exercise - Target exercise type.
 * @param initialWorkingReps - Initial reps per set (or seconds for holds).
 * @param targetSets - Sets per workout (default 3).
 * @returns ExerciseBaseline.
 */
export function createExerciseBaseline(
  exercise: ExerciseType,
  initialWorkingReps = 10,
  targetSets = 3,
): ExerciseBaseline {
  return {
    exercise,
    baselineReps: initialWorkingReps,
    currentWorkingReps: initialWorkingReps,
    targetSets,
    history: [],
    level: 1,
  };
}

/**
 * Determines whether progression criteria are met and calculates next target reps.
 * Rule: Requires at least 2 consecutive sessions with >= 85% form and easy/moderate RPE.
 *
 * @param currentReps - Current target reps.
 * @param history - Completed session history.
 * @returns Next target reps and new level offset.
 */
export function calculateNextProgressionTarget(
  currentReps: number,
  history: readonly SessionPerformance[],
): { nextReps: number; levelBump: number } {
  if (history.length < 2) {
    return { nextReps: currentReps, levelBump: 0 };
  }

  const lastTwo = history.slice(-2);
  const [s1, s2] = lastTwo;
  if (!s1 || !s2) {
    return { nextReps: currentReps, levelBump: 0 };
  }

  // Both sessions must have been performed at the current target reps to ensure a full micro-cycle
  const bothAtCurrentReps = s1.targetReps === currentReps && s2.targetReps === currentReps;
  const bothHighForm = s1.formScorePercent >= 85 && s2.formScorePercent >= 85;
  const bothMetTarget = s1.completedReps >= s1.targetReps && s2.completedReps >= s2.targetReps;
  const manageableRpe = (s1.rpe === "easy" || s1.rpe === "moderate") &&
                        (s2.rpe === "easy" || s2.rpe === "moderate");

  if (bothAtCurrentReps && bothHighForm && bothMetTarget && manageableRpe) {
    return { nextReps: currentReps + 1, levelBump: 1 };
  }

  // If struggling for 2 consecutive sessions, protect user by holding steady or slight deload
  const bothStruggled = (s1.rpe === "hard" && s2.rpe === "hard") ||
                        (s1.formScorePercent < 70 && s2.formScorePercent < 70);

  if (bothStruggled && currentReps > 5) {
    return { nextReps: Math.max(5, currentReps - 1), levelBump: 0 };
  }

  return { nextReps: currentReps, levelBump: 0 };
}

/**
 * Records a session performance and applies progression engine rules.
 *
 * @param baseline - Current ExerciseBaseline.
 * @param session - Completed SessionPerformance.
 * @returns Updated ExerciseBaseline.
 */
export function recordSessionPerformance(
  baseline: ExerciseBaseline,
  session: SessionPerformance,
): ExerciseBaseline {
  const updatedHistory = [...baseline.history, session];
  const { nextReps, levelBump } = calculateNextProgressionTarget(
    baseline.currentWorkingReps,
    updatedHistory,
  );

  return {
    ...baseline,
    history: updatedHistory,
    currentWorkingReps: nextReps,
    level: baseline.level + levelBump,
  };
}

/**
 * Simulates a multi-week progression trajectory for verification.
 *
 * @param initialBaseline - Baseline to start from.
 * @param weeks - Number of weeks to simulate.
 * @param scenario - Simulation behavior scenario.
 * @returns ProgressionSimulationResult.
 */
export function simulateMultiWeekProgression(
  initialBaseline: ExerciseBaseline,
  weeks = 6,
  scenario: "steady-progress" | "struggling" = "steady-progress",
): ProgressionSimulationResult {
  let current = initialBaseline;
  const workoutsPerWeek = 3;
  const totalWorkouts = weeks * workoutsPerWeek;

  for (let i = 0; i < totalWorkouts; i++) {
    const isEasy = scenario === "steady-progress" ? i % 3 !== 2 : false;
    const session: SessionPerformance = {
      completedAt: new Date(Date.now() + i * 86400000 * 2).toISOString(),
      completedReps: current.currentWorkingReps,
      targetReps: current.currentWorkingReps,
      rpe: isEasy ? "easy" : "moderate",
      formScorePercent: scenario === "steady-progress" ? 92 : 72,
    };
    current = recordSessionPerformance(current, session);
  }

  return {
    finalBaseline: current,
    history: current.history,
  };
}
