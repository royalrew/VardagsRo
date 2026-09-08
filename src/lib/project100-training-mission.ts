import {
  recommendCore24Families,
  type Core24QualityTier,
  type Core24Variation,
  type MovementPattern,
} from "./motion-core24";
import {
  isLoadedBackpackCompatible,
  type BackpackCarryPosition,
  type TrainingEquipment,
} from "./motion-equipment";

export const PROJECT100_MISSION_TYPES = ["upper", "lower"] as const;

export type Project100MissionType = (typeof PROJECT100_MISSION_TYPES)[number];

export const PROJECT100_MOVEMENT_PATTERNS = [
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
  "knee_dominant",
  "hip_dominant",
  "unilateral_lower",
  "calf_ankle",
  "core",
  "carry",
  "conditioning",
  "mobility",
] as const;

export type Project100MovementPattern = (typeof PROJECT100_MOVEMENT_PATTERNS)[number];

export const PROJECT100_EXERCISE_PURPOSES = [
  "strength_hypertrophy",
  "skill",
  "conditioning",
  "mobility",
] as const;

export type Project100ExercisePurpose = (typeof PROJECT100_EXERCISE_PURPOSES)[number];

export const PROJECT100_TRAINING_ENVIRONMENTS = [
  "home",
  "outdoor_gym",
  "grass",
  "forest",
  "gym",
  "other",
] as const;

export type Project100TrainingEnvironment =
  (typeof PROJECT100_TRAINING_ENVIRONMENTS)[number];

export const PROJECT100_TRAINING_SOURCES = ["motion", "jarvis", "manual"] as const;

export type Project100TrainingSource = (typeof PROJECT100_TRAINING_SOURCES)[number];

export const PROJECT100_OBSERVATION_LEVELS = [
  "full_coaching",
  "rep_counting",
  "manual",
] as const;

export type Project100ObservationLevel = (typeof PROJECT100_OBSERVATION_LEVELS)[number];

export interface Project100MissionExerciseOption {
  name: string;
  environments: Project100TrainingEnvironment[];
  equipment: string[];
}

export interface Project100MissionRequirement {
  movementPattern: Project100MovementPattern;
  label: string;
  targetSets: number;
  targetReps: number;
  alternatives: Project100MissionExerciseOption[];
}

export interface Project100MissionTemplateDefinition {
  missionType: Project100MissionType;
  title: string;
  requirements: Project100MissionRequirement[];
}

/**
 * The first deterministic upper/lower templates. They describe movement slots,
 * not one fixed exercise list, so another environment can satisfy the same plan.
 */
export const PROJECT100_DAILY_MISSION_TEMPLATES: Record<
  Project100MissionType,
  Project100MissionTemplateDefinition
> = {
  upper: {
    missionType: "upper",
    title: "Överkropp",
    requirements: [
      {
        movementPattern: "horizontal_push",
        label: "Horisontell press",
        targetSets: 3,
        targetReps: 10,
        alternatives: [
          { name: "Armhävningar", environments: ["home", "grass", "outdoor_gym", "gym"], equipment: [] },
          { name: "Hantelpress", environments: ["home", "gym"], equipment: ["dumbbells"] },
        ],
      },
      {
        movementPattern: "horizontal_pull",
        label: "Horisontellt drag",
        targetSets: 3,
        targetReps: 10,
        alternatives: [
          { name: "Kroppsrodd", environments: ["outdoor_gym", "gym"], equipment: ["low_bar"] },
          { name: "Enarms hantelrodd", environments: ["home", "gym"], equipment: ["dumbbell"] },
        ],
      },
      {
        movementPattern: "vertical_push",
        label: "Vertikal press / axlar",
        targetSets: 3,
        targetReps: 8,
        alternatives: [
          { name: "Pike push-ups", environments: ["home", "grass", "outdoor_gym", "gym"], equipment: [] },
          { name: "Hantelpress över huvudet", environments: ["home", "gym"], equipment: ["dumbbells"] },
        ],
      },
      {
        movementPattern: "vertical_pull",
        label: "Vertikalt drag",
        targetSets: 3,
        targetReps: 6,
        alternatives: [
          { name: "Pull-ups", environments: ["outdoor_gym", "gym"], equipment: ["pull_up_bar"] },
          { name: "Band-latsdrag", environments: ["home", "grass", "outdoor_gym"], equipment: ["resistance_band", "anchor"] },
        ],
      },
    ],
  },
  lower: {
    missionType: "lower",
    title: "Underkropp",
    requirements: [
      {
        movementPattern: "knee_dominant",
        label: "Knädominant",
        targetSets: 3,
        targetReps: 12,
        alternatives: [
          { name: "Knäböj", environments: ["home", "grass", "outdoor_gym", "gym"], equipment: [] },
          { name: "Goblet squat", environments: ["home", "gym"], equipment: ["dumbbell"] },
        ],
      },
      {
        movementPattern: "hip_dominant",
        label: "Höftdominant",
        targetSets: 3,
        targetReps: 10,
        alternatives: [
          { name: "Hantel-RDL", environments: ["home", "gym"], equipment: ["dumbbells"] },
          { name: "Höftlyft", environments: ["home", "grass", "gym"], equipment: [] },
        ],
      },
      {
        movementPattern: "unilateral_lower",
        label: "Unilateralt benarbete",
        targetSets: 3,
        targetReps: 10,
        alternatives: [
          { name: "Bulgarian split squat", environments: ["home", "grass", "outdoor_gym", "gym"], equipment: ["bench_or_step"] },
          { name: "Utfall bakåt", environments: ["home", "grass", "outdoor_gym", "gym"], equipment: [] },
        ],
      },
      {
        movementPattern: "calf_ankle",
        label: "Vader / fotled",
        targetSets: 3,
        targetReps: 15,
        alternatives: [
          { name: "Tåhävningar", environments: ["home", "grass", "outdoor_gym", "gym"], equipment: [] },
        ],
      },
    ],
  },
};

export interface Project100MissionCoverageExercise {
  movementPattern: Project100MovementPattern | null;
  purpose: Project100ExercisePurpose | null;
  completedSets: number;
}

export interface Project100MissionCoverageRequirement {
  movementPattern: Project100MovementPattern;
  label: string;
  targetSets: number;
  targetReps: number;
  completedSets: number;
  creditedSets: number;
  remainingSets: number;
}

export interface Project100MissionCoverage {
  percentage: number;
  completedTargetSets: number;
  targetSets: number;
  requirements: Project100MissionCoverageRequirement[];
}

const CORE_PATTERN_BY_MISSION_PATTERN: Record<Project100MovementPattern, readonly MovementPattern[]> = {
  horizontal_push: ["horizontal_push"],
  horizontal_pull: ["horizontal_pull"],
  vertical_push: ["vertical_push"],
  vertical_pull: ["vertical_pull"],
  knee_dominant: ["squat"],
  hip_dominant: ["hinge", "hip_extension"],
  unilateral_lower: ["single_leg"],
  calf_ankle: ["calf"],
  core: ["anti_extension", "anti_lateral_flexion", "trunk_control"],
  carry: [],
  conditioning: ["locomotion", "cyclic_cardio", "bodyweight_intervals"],
  mobility: [],
};

export interface Project100MissionExerciseRecommendation {
  familyId: string;
  name: string;
  qualityTier: Core24QualityTier;
  utilityScore: number;
  availableVariations: readonly Core24Variation[];
  reasons: readonly string[];
}

export interface Project100MissionRequirementRecommendations {
  movementPattern: Project100MovementPattern;
  label: string;
  recommendations: readonly Project100MissionExerciseRecommendation[];
}

/**
 * Connects each upper/lower mission slot to Core 24 using the current block's
 * environment and actually available equipment. It never picks a harder
 * variation without progression history.
 */
export function recommendProject100MissionExercises(input: {
  missionType: Project100MissionType;
  environment: Project100TrainingEnvironment;
  availableEquipment?: readonly TrainingEquipment[];
  backpackCarryPosition?: BackpackCarryPosition;
  excludedFamilyIds?: readonly string[];
}): Project100MissionRequirementRecommendations[] {
  const rankedCandidates = recommendCore24Families({
    goal: "hypertrophy",
    environment: input.environment,
    availableEquipment: input.availableEquipment,
    excludedFamilyIds: input.excludedFamilyIds,
  });
  const candidates = rankedCandidates
    .map((candidate) => {
      const availableVariations = candidate.availableVariations.filter((variation) =>
        !variation.equipment.includes("loaded_backpack")
        || (input.backpackCarryPosition !== undefined
          && isLoadedBackpackCompatible(candidate.family.id, input.backpackCarryPosition)));
      return {
        ...candidate,
        availableVariations,
        reasons: [
          candidate.reasons[0],
          `${availableVariations.length} tillgängliga variationer i vald miljö.`,
          candidate.reasons[2],
        ],
      };
    })
    .filter((candidate) => candidate.availableVariations.length > 0);

  return PROJECT100_DAILY_MISSION_TEMPLATES[input.missionType].requirements.map((requirement) => {
    const acceptedPatterns = CORE_PATTERN_BY_MISSION_PATTERN[requirement.movementPattern];
    return {
      movementPattern: requirement.movementPattern,
      label: requirement.label,
      recommendations: candidates
        .filter(({ family }) => family.patterns.some((pattern) => acceptedPatterns.includes(pattern)))
        .slice(0, 3)
        .map(({ family, score, availableVariations, reasons }) => ({
          familyId: family.id,
          name: family.name,
          qualityTier: family.qualityTier,
          utilityScore: score,
          availableVariations,
          reasons,
        })),
    };
  });
}

/** Skill, mobility and conditioning work remains visible but never silently
 * substitutes for a strength/hypertrophy movement requirement. */
export function calculateProject100MissionCoverage(
  missionType: Project100MissionType,
  exercises: Project100MissionCoverageExercise[],
): Project100MissionCoverage {
  const template = PROJECT100_DAILY_MISSION_TEMPLATES[missionType];
  const completedByPattern = new Map<Project100MovementPattern, number>();

  for (const exercise of exercises) {
    if (
      exercise.movementPattern === null ||
      exercise.purpose !== "strength_hypertrophy" ||
      exercise.completedSets <= 0
    ) {
      continue;
    }
    completedByPattern.set(
      exercise.movementPattern,
      (completedByPattern.get(exercise.movementPattern) ?? 0) + exercise.completedSets,
    );
  }

  const requirements = template.requirements.map((requirement) => {
    const completedSets = completedByPattern.get(requirement.movementPattern) ?? 0;
    const creditedSets = Math.min(completedSets, requirement.targetSets);
    return {
      movementPattern: requirement.movementPattern,
      label: requirement.label,
      targetSets: requirement.targetSets,
      targetReps: requirement.targetReps,
      completedSets,
      creditedSets,
      remainingSets: Math.max(0, requirement.targetSets - completedSets),
    };
  });
  const targetSets = requirements.reduce((sum, requirement) => sum + requirement.targetSets, 0);
  const completedTargetSets = requirements.reduce(
    (sum, requirement) => sum + requirement.creditedSets,
    0,
  );

  return {
    percentage: targetSets === 0 ? 0 : Math.round((completedTargetSets / targetSets) * 100),
    completedTargetSets,
    targetSets,
    requirements,
  };
}

const KNOWN_EXERCISE_CLASSIFICATIONS: Array<{
  pattern: RegExp;
  movementPattern: Project100MovementPattern;
  purpose: Project100ExercisePurpose;
}> = [
  { pattern: /^(armhävningar?|push-?ups?)$/i, movementPattern: "horizontal_push", purpose: "strength_hypertrophy" },
  { pattern: /^(dips?|bänk-?dips?)$/i, movementPattern: "horizontal_push", purpose: "strength_hypertrophy" },
  { pattern: /^(kroppsrodd|enarms hantelrodd|hantelrodd)$/i, movementPattern: "horizontal_pull", purpose: "strength_hypertrophy" },
  { pattern: /^(pike push-?ups?|hantelpress över huvudet)$/i, movementPattern: "vertical_push", purpose: "strength_hypertrophy" },
  { pattern: /^(pull-?ups?|chins?|band-latsdrag)$/i, movementPattern: "vertical_pull", purpose: "strength_hypertrophy" },
  { pattern: /^(knäböj(?:ningar?)?|squats?|goblet squat)$/i, movementPattern: "knee_dominant", purpose: "strength_hypertrophy" },
  { pattern: /^(hantel-?rdl|rdl|höftlyft)$/i, movementPattern: "hip_dominant", purpose: "strength_hypertrophy" },
  { pattern: /^(utfall|utfall bakåt|bulgarian split squat)$/i, movementPattern: "unilateral_lower", purpose: "strength_hypertrophy" },
  { pattern: /^tåhävningar?$/i, movementPattern: "calf_ankle", purpose: "strength_hypertrophy" },
  { pattern: /^(sit-?ups?|planka|dead bug|hollow body hold)$/i, movementPattern: "core", purpose: "strength_hypertrophy" },
  { pattern: /^(handstående|handstand|väggstående på händer)$/i, movementPattern: "vertical_push", purpose: "skill" },
  { pattern: /^burpees?$/i, movementPattern: "conditioning", purpose: "conditioning" },
];

/** Returns null instead of guessing when a reported exercise is unknown. */
export function classifyProject100MissionExercise(name: string): {
  movementPattern: Project100MovementPattern;
  purpose: Project100ExercisePurpose;
} | null {
  const normalized = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  const match = KNOWN_EXERCISE_CLASSIFICATIONS.find((candidate) => candidate.pattern.test(normalized));
  return match
    ? { movementPattern: match.movementPattern, purpose: match.purpose }
    : null;
}
