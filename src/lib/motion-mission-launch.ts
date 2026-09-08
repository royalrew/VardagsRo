import { getCore24Family } from "./motion-core24";
import type { TrackableExerciseId } from "./motion-library";
import type {
  Project100MovementPattern,
  Project100ObservationLevel,
  Project100TrainingEnvironment,
} from "./project100-training-mission";
import type { BackpackCarryPosition } from "./motion-equipment";

export interface MotionMissionLaunch {
  missionId: string;
  familyId: "pushup" | "squat" | "bulgarian-split-squat" | "plank";
  variationId: string;
  exerciseId: TrackableExerciseId;
  exerciseName: string;
  movementPattern: Project100MovementPattern;
  environment: Project100TrainingEnvironment;
  targetReps: number;
  targetDurationSeconds: number | null;
  weightKg: number | null;
  backpackCarryPosition: BackpackCarryPosition | null;
}

export interface MotionMissionSetResult {
  reps: number;
  holdSeconds: number;
  rpe: number | null;
  startedAt: string;
  endedAt: string;
  sourceEventId: string;
  setupProfileId: string | null;
  observationLevel: Project100ObservationLevel;
  romConfidence: number | null;
}

const TRACKABLE_MISSION_FAMILIES = {
  pushup: { exerciseId: "pushup", movementPattern: "horizontal_push", variationIds: ["pushup"] },
  squat: { exerciseId: "squat", movementPattern: "knee_dominant", variationIds: ["squat"] },
  "bulgarian-split-squat": { exerciseId: "bulgarian-split-squat", movementPattern: "unilateral_lower", variationIds: ["bulgarian-split-squat"] },
  plank: { exerciseId: "plank", movementPattern: "core", variationIds: ["plank"] },
} as const;

const environments = new Set<Project100TrainingEnvironment>([
  "home", "outdoor_gym", "grass", "forest", "gym", "other",
]);
const carryPositions = new Set<BackpackCarryPosition>(["back", "front_hug", "goblet_hold", "other"]);

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getCore24MissionTrackingId(
  familyId: string,
  variationId: string,
): TrackableExerciseId | null {
  const entry = TRACKABLE_MISSION_FAMILIES[familyId as keyof typeof TRACKABLE_MISSION_FAMILIES];
  if (!entry || !(entry.variationIds as readonly string[]).includes(variationId)) return null;
  return entry.exerciseId;
}

export function buildMotionMissionLaunchHref(input: MotionMissionLaunch): string {
  const params = new URLSearchParams({
    mission: input.missionId,
    family: input.familyId,
    variation: input.variationId,
    environment: input.environment,
    targetReps: String(input.targetReps),
  });
  if (input.targetDurationSeconds !== null) params.set("targetDuration", String(input.targetDurationSeconds));
  if (input.weightKg !== null) params.set("weightKg", String(input.weightKg));
  if (input.backpackCarryPosition !== null) params.set("carry", input.backpackCarryPosition);
  return `/projekt-100/traning/motion?${params.toString()}`;
}

export function buildMotionMissionBlockInput(
  launch: MotionMissionLaunch,
  result: MotionMissionSetResult,
) {
  const isHold = launch.exerciseId === "plank";
  return {
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    activeSeconds: Math.max(0, Math.floor((Date.parse(result.endedAt) - Date.parse(result.startedAt)) / 1_000)),
    environment: launch.environment,
    location: null,
    source: "motion" as const,
    sourceEventId: result.sourceEventId,
    setupProfileId: result.setupProfileId,
    exercises: [{
      name: launch.exerciseName,
      movementPattern: launch.movementPattern,
      purpose: "strength_hypertrophy" as const,
      notes: [
        `Core 24: ${launch.familyId}/${launch.variationId}`,
        launch.backpackCarryPosition ? `loaded_backpack: ${launch.backpackCarryPosition}` : null,
      ].filter(Boolean).join(" · "),
      sets: [{
        reps: isHold ? null : result.reps,
        weightKg: launch.weightKg,
        durationSeconds: isHold ? Math.floor(result.holdSeconds) : null,
        distanceMeters: null,
        rpe: result.rpe,
        performedAt: result.endedAt,
        sourceEventId: result.sourceEventId,
        observationLevel: result.observationLevel,
        romConfidence: result.romConfidence,
      }],
    }],
  };
}

/** Parses untrusted URL state and derives names/patterns from Core 24 instead of trusting the query. */
export function parseMotionMissionLaunch(
  params: Record<string, string | string[] | undefined>,
): MotionMissionLaunch | null {
  const missionId = one(params.mission)?.trim();
  const familyId = one(params.family)?.trim() as keyof typeof TRACKABLE_MISSION_FAMILIES | undefined;
  const variationId = one(params.variation)?.trim();
  const environment = one(params.environment)?.trim() as Project100TrainingEnvironment | undefined;
  if (!missionId || missionId.length > 200 || !familyId || !variationId || !environment) return null;
  if (!environments.has(environment)) return null;

  const tracking = TRACKABLE_MISSION_FAMILIES[familyId];
  const family = getCore24Family(familyId);
  const variation = family?.variations.find((item) => item.id === variationId);
  if (!tracking || !family || !variation || !(tracking.variationIds as readonly string[]).includes(variationId)) return null;

  const rawTargetReps = Number(one(params.targetReps));
  const rawTargetDuration = Number(one(params.targetDuration));
  const rawWeight = Number(one(params.weightKg));
  const carry = one(params.carry) as BackpackCarryPosition | undefined;
  const isHold = tracking.exerciseId === "plank";

  return {
    missionId,
    familyId,
    variationId,
    exerciseId: tracking.exerciseId,
    exerciseName: variation.name,
    movementPattern: tracking.movementPattern,
    environment,
    targetReps: Number.isInteger(rawTargetReps) && rawTargetReps > 0 && rawTargetReps <= 10_000
      ? rawTargetReps
      : isHold ? 30 : 10,
    targetDurationSeconds: isHold
      ? Number.isInteger(rawTargetDuration) && rawTargetDuration > 0 ? rawTargetDuration : 30
      : null,
    weightKg: Number.isFinite(rawWeight) && rawWeight >= 0 ? rawWeight : null,
    backpackCarryPosition: carry && carryPositions.has(carry) ? carry : null,
  };
}
