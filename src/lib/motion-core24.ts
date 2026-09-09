import type { TrackableExerciseId } from "./motion-library";
import type { TrainingEnvironment, TrainingEquipment } from "./motion-equipment";

export type Core24Section = "upper" | "lower" | "core_skill" | "conditioning";
export type TrainingGoal = "hypertrophy" | "strength_skill" | "conditioning";
export type Core24QualityTier = "gold" | "silver" | "manual";
export type MovementPattern =
  | "horizontal_push"
  | "horizontal_pull"
  | "vertical_push"
  | "vertical_pull"
  | "squat"
  | "single_leg"
  | "hinge"
  | "hip_extension"
  | "calf"
  | "anti_extension"
  | "anti_lateral_flexion"
  | "trunk_control"
  | "inversion"
  | "locomotion"
  | "cyclic_cardio"
  | "bodyweight_intervals";

export interface Core24UtilityProfile {
  stimulusEfficiency: number;
  progressionPotential: number;
  movementCoverage: number;
  environmentAccess: number;
  loadScalability: number;
  muscularStability: number;
  observability: number;
}
export interface Core24Variation {
  id: string;
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5 | 6;
  equipment: readonly TrainingEquipment[];
  trackableExerciseId?: TrackableExerciseId;
}

export interface Core24Family {
  id: string;
  name: string;
  section: Core24Section;
  patterns: readonly MovementPattern[];
  goals: readonly TrainingGoal[];
  environments: readonly TrainingEnvironment[];
  qualityTier: Core24QualityTier;
  qualityNote: string;
  utility: Core24UtilityProfile;
  variations: readonly Core24Variation[];
}

type FamilyInput = Omit<Core24Family, "utility"> & { utility: readonly [number, number, number, number, number, number, number] };

const family = (input: FamilyInput): Core24Family => ({
  ...input,
  utility: {
    stimulusEfficiency: input.utility[0],
    progressionPotential: input.utility[1],
    movementCoverage: input.utility[2],
    environmentAccess: input.utility[3],
    loadScalability: input.utility[4],
    muscularStability: input.utility[5],
    observability: input.utility[6],
  },
});

const anywhere: readonly TrainingEnvironment[] = ["home", "outdoor_gym", "grass", "forest", "gym", "other"];
const indoorOutdoor: readonly TrainingEnvironment[] = ["home", "outdoor_gym", "grass", "gym", "other"];
const gymAndHome: readonly TrainingEnvironment[] = ["home", "gym", "other"];

/** The curated source of truth. Silver means a tracker exists; Gold still requires live validation. */
export const CORE_24_FAMILIES: readonly Core24Family[] = [
  family({ id: "pushup", name: "Armhävning", section: "upper", patterns: ["horizontal_push"], goals: ["hypertrophy", "strength_skill"], environments: anywhere, qualityTier: "silver", qualityNote: "Reptracker finns; livevalidering återstår.", utility: [5, 5, 4, 5, 4, 5, 5], variations: [
    { id: "incline-pushup", name: "Lutande armhävning", difficulty: 1, equipment: ["bench_or_chair"] },
    { id: "pushup", name: "Armhävning", difficulty: 2, equipment: ["bodyweight"], trackableExerciseId: "pushup" },
    { id: "loaded-pushup", name: "Belastad armhävning", difficulty: 4, equipment: ["loaded_backpack"] },
  ] }),
  family({ id: "dumbbell-floor-press", name: "Hantelpress på golv", section: "upper", patterns: ["horizontal_push"], goals: ["hypertrophy"], environments: gymAndHome, qualityTier: "manual", qualityNote: "Planeras och loggas manuellt.", utility: [5, 5, 3, 3, 5, 5, 3], variations: [
    { id: "single-floor-press", name: "Enarms golvpress", difficulty: 2, equipment: ["dumbbell"] },
    { id: "floor-press", name: "Hantelpress på golv", difficulty: 3, equipment: ["dumbbell"] },
    { id: "pause-floor-press", name: "Pausad golvpress", difficulty: 4, equipment: ["dumbbell"] },
  ] }),
  family({ id: "one-arm-row", name: "Enarmsrodd", section: "upper", patterns: ["horizontal_pull"], goals: ["hypertrophy", "strength_skill"], environments: gymAndHome, qualityTier: "silver", qualityNote: "Roddtracker finns; enarmsvariant behöver livevalideras.", utility: [5, 5, 4, 3, 5, 5, 4], variations: [
    { id: "supported-one-arm-row", name: "Stödd enarmsrodd", difficulty: 2, equipment: ["dumbbell", "bench_or_chair"] },
    { id: "supported-one-arm-kettlebell-row", name: "Stödd enarmsrodd med kettlebell", difficulty: 2, equipment: ["kettlebell", "bench_or_chair"] },
    { id: "one-arm-row", name: "Enarms hantelrodd", difficulty: 3, equipment: ["dumbbell"] },
    { id: "one-arm-kettlebell-row", name: "Enarms kettlebellrodd", difficulty: 3, equipment: ["kettlebell"] },
    { id: "bent-over-row", name: "Framåtlutad hantelrodd", difficulty: 3, equipment: ["dumbbell"], trackableExerciseId: "bent-over-row" },
  ] }),
  family({ id: "body-row", name: "Kroppsrodd", section: "upper", patterns: ["horizontal_pull"], goals: ["hypertrophy", "strength_skill"], environments: ["outdoor_gym", "gym", "other"], qualityTier: "manual", qualityNote: "Manuell tills säker rigg och tracker validerats.", utility: [5, 5, 4, 2, 4, 5, 3], variations: [
    { id: "high-body-row", name: "Hög kroppsrodd", difficulty: 1, equipment: ["low_bar_or_straps"] },
    { id: "body-row", name: "Kroppsrodd", difficulty: 3, equipment: ["low_bar_or_straps"] },
    { id: "feet-elevated-body-row", name: "Kroppsrodd med höjda fötter", difficulty: 5, equipment: ["low_bar_or_straps", "bench_or_chair"] },
  ] }),
  family({ id: "pullup", name: "Pull-up/chins", section: "upper", patterns: ["vertical_pull"], goals: ["hypertrophy", "strength_skill"], environments: ["outdoor_gym", "gym", "home", "other"], qualityTier: "manual", qualityNote: "Manuell tills vertikal dragtracker validerats.", utility: [5, 5, 4, 3, 4, 4, 3], variations: [
    { id: "assisted-chinup", name: "Assisterad chin-up", difficulty: 2, equipment: ["pullup_bar", "resistance_band"] },
    { id: "chinup", name: "Chin-up", difficulty: 4, equipment: ["pullup_bar"] },
    { id: "pullup", name: "Pull-up", difficulty: 5, equipment: ["pullup_bar"] },
  ] }),
  family({ id: "band-lat-pulldown", name: "Band-latsdrag", section: "upper", patterns: ["vertical_pull"], goals: ["hypertrophy"], environments: indoorOutdoor, qualityTier: "manual", qualityNote: "Manuell tills band och fästpunkt kan kvalitetssäkras.", utility: [4, 4, 3, 4, 4, 5, 3], variations: [
    { id: "kneeling-band-pulldown", name: "Knästående banddrag", difficulty: 1, equipment: ["resistance_band"] },
    { id: "band-lat-pulldown", name: "Band-latsdrag", difficulty: 2, equipment: ["resistance_band"] },
    { id: "single-arm-band-pulldown", name: "Enarms banddrag", difficulty: 3, equipment: ["resistance_band"] },
  ] }),
  family({ id: "pike-pushup", name: "Pik-armhävning", section: "upper", patterns: ["vertical_push"], goals: ["hypertrophy", "strength_skill"], environments: anywhere, qualityTier: "silver", qualityNote: "Reptracker finns; livevalidering återstår.", utility: [4, 5, 3, 5, 2, 4, 5], variations: [
    { id: "incline-pike-pushup", name: "Lutande pik-armhävning", difficulty: 2, equipment: ["bench_or_chair"] },
    { id: "pike-pushup", name: "Pik-armhävning", difficulty: 3, equipment: ["bodyweight"], trackableExerciseId: "pike-pushup" },
    { id: "feet-elevated-pike-pushup", name: "Pik-armhävning med höjda fötter", difficulty: 5, equipment: ["bench_or_chair"] },
  ] }),
  family({ id: "overhead-press", name: "Hantelpress över huvudet", section: "upper", patterns: ["vertical_push"], goals: ["hypertrophy", "strength_skill"], environments: gymAndHome, qualityTier: "silver", qualityNote: "Reptracker finns; livevalidering återstår.", utility: [5, 5, 3, 3, 5, 5, 5], variations: [
    { id: "single-arm-overhead-press", name: "Enarms axelpress", difficulty: 2, equipment: ["dumbbell"] },
    { id: "overhead-press", name: "Hantelpress över huvudet", difficulty: 3, equipment: ["dumbbell"], trackableExerciseId: "overhead-press" },
    { id: "pause-overhead-press", name: "Pausad axelpress", difficulty: 4, equipment: ["dumbbell"] },
  ] }),

  family({ id: "squat", name: "Knäböj", section: "lower", patterns: ["squat"], goals: ["hypertrophy", "strength_skill"], environments: anywhere, qualityTier: "silver", qualityNote: "Reptracker finns; livevalidering återstår.", utility: [4, 5, 5, 5, 5, 5, 5], variations: [
    { id: "tempo-squat", name: "Tempo-knäböj", difficulty: 2, equipment: ["bodyweight"] },
    { id: "squat", name: "Knäböj", difficulty: 2, equipment: ["bodyweight"], trackableExerciseId: "squat" },
    { id: "loaded-backpack-squat", name: "Knäböj med ryggsäck", difficulty: 3, equipment: ["loaded_backpack"] },
    { id: "assisted-pistol-to-box", name: "Assisterad pistol till box", difficulty: 5, equipment: ["bench_or_chair"] },
    { id: "counterweighted-pistol", name: "Pistol med motvikt", difficulty: 5, equipment: ["dumbbell"] },
    { id: "free-pistol", name: "Fri pistol squat", difficulty: 6, equipment: ["bodyweight"] },
  ] }),
  family({ id: "goblet-squat", name: "Goblet squat", section: "lower", patterns: ["squat"], goals: ["hypertrophy"], environments: gymAndHome, qualityTier: "silver", qualityNote: "Reptracker finns för hantel/kettlebell; ryggsäck kräver ny kalibrering.", utility: [5, 5, 4, 4, 5, 5, 5], variations: [
    { id: "light-goblet-squat", name: "Lätt goblet squat", difficulty: 2, equipment: ["dumbbell"] },
    { id: "goblet-squat", name: "Goblet squat", difficulty: 3, equipment: ["kettlebell"], trackableExerciseId: "goblet-squat" },
    { id: "backpack-goblet-squat", name: "Goblet squat med ryggsäck", difficulty: 3, equipment: ["loaded_backpack"] },
  ] }),
  family({ id: "bulgarian-split-squat", name: "Bulgarian split squat", section: "lower", patterns: ["single_leg", "squat"], goals: ["hypertrophy", "strength_skill"], environments: indoorOutdoor, qualityTier: "silver", qualityNote: "Reptracker finns; belastade varianter behöver livevalideras.", utility: [5, 5, 5, 4, 5, 4, 5], variations: [
    { id: "supported-bulgarian", name: "Stödd Bulgarian split squat", difficulty: 2, equipment: ["bench_or_chair"] },
    { id: "bulgarian-split-squat", name: "Bulgarian split squat", difficulty: 3, equipment: ["bench_or_chair"], trackableExerciseId: "bulgarian-split-squat" },
    { id: "loaded-bulgarian", name: "Belastad Bulgarian split squat", difficulty: 4, equipment: ["bench_or_chair", "loaded_backpack"] },
  ] }),
  family({ id: "reverse-lunge", name: "Bakåtutfall", section: "lower", patterns: ["single_leg"], goals: ["hypertrophy", "strength_skill"], environments: anywhere, qualityTier: "silver", qualityNote: "Utfallstracker finns; bakåtvarianten behöver livevalideras.", utility: [5, 5, 4, 5, 5, 4, 5], variations: [
    { id: "supported-reverse-lunge", name: "Stött bakåtutfall", difficulty: 1, equipment: ["bodyweight"] },
    { id: "reverse-lunge", name: "Bakåtutfall", difficulty: 2, equipment: ["bodyweight"], trackableExerciseId: "lunge" },
    { id: "loaded-reverse-lunge", name: "Belastat bakåtutfall", difficulty: 3, equipment: ["loaded_backpack"] },
  ] }),
  family({ id: "step-up", name: "Step-up", section: "lower", patterns: ["single_leg"], goals: ["hypertrophy", "conditioning"], environments: indoorOutdoor, qualityTier: "manual", qualityNote: "Manuell tills höjd och reptracker validerats.", utility: [4, 5, 4, 4, 5, 4, 3], variations: [
    { id: "low-step-up", name: "Låg step-up", difficulty: 1, equipment: ["bench_or_chair"] },
    { id: "step-up", name: "Step-up", difficulty: 2, equipment: ["bench_or_chair"] },
    { id: "loaded-step-up", name: "Belastad step-up", difficulty: 4, equipment: ["bench_or_chair", "loaded_backpack"] },
  ] }),
  family({ id: "dumbbell-rdl", name: "Hantel-RDL", section: "lower", patterns: ["hinge"], goals: ["hypertrophy", "strength_skill"], environments: gymAndHome, qualityTier: "silver", qualityNote: "Reptracker finns; livevalidering återstår.", utility: [5, 5, 5, 3, 5, 5, 5], variations: [
    { id: "dowel-hinge", name: "Höftfällning utan vikt", difficulty: 1, equipment: ["bodyweight"] },
    { id: "dumbbell-rdl", name: "Hantel-RDL", difficulty: 3, equipment: ["dumbbell"], trackableExerciseId: "dumbbell-rdl" },
    { id: "staggered-rdl", name: "Staggered-stance RDL", difficulty: 4, equipment: ["dumbbell"] },
  ] }),
  family({ id: "hip-bridge", name: "Höftlyft", section: "lower", patterns: ["hip_extension"], goals: ["hypertrophy"], environments: anywhere, qualityTier: "manual", qualityNote: "Manuell tills ROM-tracker validerats.", utility: [4, 5, 3, 5, 4, 5, 4], variations: [
    { id: "glute-bridge", name: "Höftlyft på golv", difficulty: 1, equipment: ["bodyweight"] },
    { id: "loaded-glute-bridge", name: "Belastat höftlyft", difficulty: 3, equipment: ["loaded_backpack"] },
    { id: "single-leg-glute-bridge", name: "Enbens höftlyft", difficulty: 4, equipment: ["bodyweight"] },
  ] }),
  family({ id: "calf-raise", name: "Tåhävning", section: "lower", patterns: ["calf"], goals: ["hypertrophy", "strength_skill"], environments: anywhere, qualityTier: "silver", qualityNote: "Reptracker finns; livevalidering återstår.", utility: [4, 5, 2, 5, 5, 5, 4], variations: [
    { id: "calf-raise", name: "Tåhävning", difficulty: 1, equipment: ["bodyweight"], trackableExerciseId: "calf-raise" },
    { id: "single-leg-calf-raise", name: "Enbens tåhävning", difficulty: 3, equipment: ["bodyweight"] },
    { id: "loaded-calf-raise", name: "Belastad tåhävning", difficulty: 3, equipment: ["loaded_backpack"] },
  ] }),

  family({ id: "plank", name: "Planka", section: "core_skill", patterns: ["anti_extension"], goals: ["hypertrophy", "strength_skill"], environments: anywhere, qualityTier: "silver", qualityNote: "Hålltracker finns; livevalidering återstår.", utility: [4, 4, 4, 5, 2, 5, 5], variations: [
    { id: "incline-plank", name: "Lutande planka", difficulty: 1, equipment: ["bench_or_chair"] },
    { id: "plank", name: "Planka", difficulty: 2, equipment: ["bodyweight"], trackableExerciseId: "plank" },
    { id: "long-lever-plank", name: "Planka med lång hävarm", difficulty: 4, equipment: ["bodyweight"] },
  ] }),
  family({ id: "side-plank", name: "Sidoplanka", section: "core_skill", patterns: ["anti_lateral_flexion"], goals: ["strength_skill"], environments: anywhere, qualityTier: "manual", qualityNote: "Planerad tracker; loggas manuellt nu.", utility: [4, 4, 3, 5, 1, 4, 4], variations: [
    { id: "knee-side-plank", name: "Sidoplanka på knä", difficulty: 1, equipment: ["bodyweight"] },
    { id: "side-plank", name: "Sidoplanka", difficulty: 2, equipment: ["bodyweight"] },
    { id: "star-side-plank", name: "Stjärnplanka", difficulty: 5, equipment: ["bodyweight"] },
  ] }),
  family({ id: "dead-bug", name: "Dead bug", section: "core_skill", patterns: ["trunk_control"], goals: ["strength_skill"], environments: anywhere, qualityTier: "manual", qualityNote: "Loggas manuellt tills diagonal tracker validerats.", utility: [4, 4, 4, 5, 1, 5, 3], variations: [
    { id: "heel-tap-dead-bug", name: "Dead bug med hälisättning", difficulty: 1, equipment: ["bodyweight"] },
    { id: "dead-bug", name: "Dead bug", difficulty: 2, equipment: ["bodyweight"] },
    { id: "long-lever-dead-bug", name: "Dead bug med lång hävarm", difficulty: 4, equipment: ["bodyweight"] },
  ] }),
  family({ id: "hollow-body", name: "Hollow body hold", section: "core_skill", patterns: ["anti_extension", "trunk_control"], goals: ["strength_skill"], environments: anywhere, qualityTier: "manual", qualityNote: "Loggas manuellt tills hålltracker validerats.", utility: [4, 5, 4, 5, 1, 4, 4], variations: [
    { id: "tuck-hollow", name: "Tuck hollow hold", difficulty: 1, equipment: ["bodyweight"] },
    { id: "single-leg-hollow", name: "Hollow hold med ett ben", difficulty: 3, equipment: ["bodyweight"] },
    { id: "hollow-body", name: "Hollow body hold", difficulty: 4, equipment: ["bodyweight"] },
  ] }),
  family({ id: "wall-handstand", name: "Handstående mot vägg", section: "core_skill", patterns: ["inversion", "vertical_push"], goals: ["strength_skill"], environments: ["home", "gym", "other"], qualityTier: "silver", qualityNote: "Hålltracker finns; väggsäkerhet och livevalidering återstår.", utility: [3, 5, 4, 3, 1, 3, 4], variations: [
    { id: "wall-walk", name: "Wall walk", difficulty: 2, equipment: ["wall"] },
    { id: "wall-handstand", name: "Handstående mot vägg", difficulty: 4, equipment: ["wall"], trackableExerciseId: "handstand-hold" },
    { id: "wall-handstand-shrug", name: "Skulderpress i handstående", difficulty: 5, equipment: ["wall"] },
  ] }),

  family({ id: "walk-run", name: "Gång och löpning", section: "conditioning", patterns: ["locomotion", "cyclic_cardio"], goals: ["conditioning"], environments: ["outdoor_gym", "grass", "forest", "gym", "other"], qualityTier: "manual", qualityNote: "Tid/distans/puls används; webbkamera krävs inte.", utility: [5, 5, 5, 5, 1, 5, 2], variations: [
    { id: "brisk-walk", name: "Rask gång", difficulty: 1, equipment: ["bodyweight"] },
    { id: "run", name: "Löpning", difficulty: 3, equipment: ["bodyweight"] },
    { id: "hill-interval", name: "Backintervaller", difficulty: 5, equipment: ["bodyweight"] },
  ] }),
  family({ id: "cycling", name: "Cykling och spinning", section: "conditioning", patterns: ["cyclic_cardio"], goals: ["conditioning"], environments: ["outdoor_gym", "forest", "gym", "other"], qualityTier: "manual", qualityNote: "Tid/distans/puls används; webbkamera krävs inte.", utility: [5, 5, 4, 3, 3, 5, 1], variations: [
    { id: "easy-cycle", name: "Lugn cykling", difficulty: 1, equipment: ["bicycle"] },
    { id: "tempo-cycle", name: "Tempocykling", difficulty: 3, equipment: ["bicycle"] },
    { id: "cycle-interval", name: "Cykelintervaller", difficulty: 5, equipment: ["bicycle"] },
  ] }),
  family({ id: "bodyweight-intervals", name: "Kroppsviktsintervaller", section: "conditioning", patterns: ["bodyweight_intervals"], goals: ["conditioning"], environments: anywhere, qualityTier: "silver", qualityNote: "Jumping jacks kan räknas; familjens övriga variationer är manuella.", utility: [5, 4, 5, 5, 1, 4, 4], variations: [
    { id: "low-impact-interval", name: "Lågintensiva stegintervaller", difficulty: 1, equipment: ["bodyweight"] },
    { id: "jumping-jacks", name: "Jumping jacks", difficulty: 2, equipment: ["bodyweight"], trackableExerciseId: "jumping-jacks" },
    { id: "mountain-climbers", name: "Mountain climbers", difficulty: 3, equipment: ["bodyweight"] },
  ] }),
] as const;

export interface Core24RecommendationContext {
  goal: TrainingGoal;
  environment: TrainingEnvironment;
  availableEquipment?: readonly TrainingEquipment[];
  excludedFamilyIds?: readonly string[];
}

export interface ScoredCore24Family {
  family: Core24Family;
  score: number;
  availableVariations: readonly Core24Variation[];
  reasons: readonly string[];
}

const goalWeights: Record<TrainingGoal, Core24UtilityProfile> = {
  hypertrophy: { stimulusEfficiency: 0.25, progressionPotential: 0.2, movementCoverage: 0.12, environmentAccess: 0.1, loadScalability: 0.15, muscularStability: 0.13, observability: 0.05 },
  strength_skill: { stimulusEfficiency: 0.15, progressionPotential: 0.2, movementCoverage: 0.15, environmentAccess: 0.1, loadScalability: 0.1, muscularStability: 0.15, observability: 0.15 },
  conditioning: { stimulusEfficiency: 0.3, progressionPotential: 0.15, movementCoverage: 0.2, environmentAccess: 0.15, loadScalability: 0.05, muscularStability: 0.1, observability: 0.05 },
};

function variationIsAvailable(variation: Core24Variation, equipment: ReadonlySet<TrainingEquipment>): boolean {
  return variation.equipment.every((item) => item === "bodyweight" || equipment.has(item));
}

export function scoreCore24Family(family: Core24Family, goal: TrainingGoal): number {
  const weights = goalWeights[goal];
  const raw = (Object.keys(weights) as Array<keyof Core24UtilityProfile>)
    .reduce((sum, key) => sum + family.utility[key] * weights[key], 0);
  return Math.round(raw * 20);
}

export function recommendCore24Families(context: Core24RecommendationContext): ScoredCore24Family[] {
  const equipment = new Set<TrainingEquipment>(["bodyweight", ...(context.availableEquipment ?? [])]);
  const excluded = new Set(context.excludedFamilyIds ?? []);

  return CORE_24_FAMILIES
    .filter((item) => item.goals.includes(context.goal))
    .filter((item) => item.environments.includes(context.environment))
    .filter((item) => !excluded.has(item.id))
    .map((item) => {
      const availableVariations = item.variations.filter((variation) => variationIsAvailable(variation, equipment));
      return {
        family: item,
        score: scoreCore24Family(item, context.goal),
        availableVariations,
        reasons: [
          `Nyttopoäng ${scoreCore24Family(item, context.goal)}/100 för målet.`,
          `${availableVariations.length} tillgängliga variationer i vald miljö.`,
          item.qualityNote,
        ],
      };
    })
    .filter((item) => item.availableVariations.length > 0)
    .sort((a, b) => b.score - a.score || a.family.name.localeCompare(b.family.name, "sv"));
}

export function getCore24Family(id: string): Core24Family | undefined {
  return CORE_24_FAMILIES.find((item) => item.id === id);
}
