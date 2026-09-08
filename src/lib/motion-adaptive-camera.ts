import type {
  CameraPlacement,
  ExerciseFramingFeedback,
  StanceOrientation,
} from "./motion-camera-coach";
import type { TrackableExerciseId } from "./motion-library";
import type { TrainingEnvironment } from "./motion-equipment";
import type { Project100ObservationLevel } from "./project100-training-mission";

export interface AdaptiveCameraRequirement {
  preferredStance: StanceOrientation;
  acceptedStances: readonly StanceOrientation[];
  requiredBody: "full_body" | "upper_body";
  minStableSeconds: number;
  minCalibrationReps: number;
  minCalibrationHoldSeconds: number;
  reason: string;
  unobservable: string;
}

export interface AdaptiveCameraSample {
  timestampMs: number;
  poseVisible: boolean;
  fullBodyVisible: boolean;
  luminance: number | null;
  framing: ExerciseFramingFeedback | null;
}

export interface AdaptiveCameraEvaluation {
  observationLevel: Project100ObservationLevel;
  ready: boolean;
  stableSeconds: number;
  usableSamplePercent: number;
  advice: string;
  reason: string;
  stance: StanceOrientation | null;
  placement: CameraPlacement | null;
}

export interface SavedCameraSetupProfile {
  id: string;
  version: 1;
  environment: TrainingEnvironment;
  exerciseId: TrackableExerciseId;
  stance: StanceOrientation;
  placement: CameraPlacement;
  resolution: string;
  observationLevel: Project100ObservationLevel;
  usableSamplePercent: number;
  averageLuminance: number | null;
  calibratedAt: string;
}

/** A setup profile can support coarse ROM observability, never full technique certainty. */
export function cameraSetupRomConfidence(profile: SavedCameraSetupProfile | null): number | null {
  if (!profile || profile.observationLevel === "manual") return null;
  return Math.min(0.8, Math.round(profile.usableSamplePercent) / 100);
}

const PROFILE_OR_DIAGONAL = new Set<TrackableExerciseId>([
  "pushup",
  "plank",
  "pike-pushup",
  "bench-dips",
  "bulgarian-split-squat",
  "bent-over-row",
  "dumbbell-rdl",
  "kettlebell-swing",
]);

const UPPER_BODY_ONLY = new Set<TrackableExerciseId>([
  "bicep-curl",
  "overhead-press",
  "lateral-raise",
]);

export function getAdaptiveCameraRequirement(exerciseId: TrackableExerciseId): AdaptiveCameraRequirement {
  const needsSideView = PROFILE_OR_DIAGONAL.has(exerciseId);
  const isHold = exerciseId === "plank" || exerciseId === "handstand-hold";
  return {
    preferredStance: needsSideView ? "diagonal" : "front",
    acceptedStances: needsSideView ? ["diagonal", "profile"] : ["front", "diagonal"],
    requiredBody: UPPER_BODY_ONLY.has(exerciseId) ? "upper_body" : "full_body",
    minStableSeconds: 5,
    minCalibrationReps: isHold ? 0 : 2,
    minCalibrationHoldSeconds: isHold ? 3 : 0,
    reason: needsSideView
      ? "Snett eller i profil gör rörelsedjup och kroppslinje tydligare."
      : "Framifrån eller lätt snett ger stabil repräkning och synlig symmetri.",
    unobservable: needsSideView
      ? "Kameran kan inte säkert bedöma full symmetri från profil."
      : "Kameran kan inte säkert bedöma exakt djup när kroppen är helt framåtvänd.",
  };
}

export function evaluateAdaptiveCameraSetup(input: {
  exerciseId: TrackableExerciseId;
  samples: readonly AdaptiveCameraSample[];
  calibrationReps: number;
  calibrationHoldSeconds: number;
}): AdaptiveCameraEvaluation {
  const requirement = getAdaptiveCameraRequirement(input.exerciseId);
  const latest = input.samples.at(-1) ?? null;
  if (!latest?.poseVisible || !latest.framing) {
    return {
      observationLevel: "manual",
      ready: false,
      stableSeconds: 0,
      usableSamplePercent: 0,
      advice: "Ställ dig så att kameran hittar kroppen.",
      reason: requirement.reason,
      stance: null,
      placement: null,
    };
  }

  const sampleIsUsable = (sample: AdaptiveCameraSample) => {
    if (!sample.poseVisible || !sample.framing) return false;
    if (sample.luminance !== null && sample.luminance < 45) return false;
    if (requirement.requiredBody === "full_body" && !sample.fullBodyVisible) return false;
    if (!requirement.acceptedStances.includes(sample.framing.stance)) return false;
    return sample.framing.issues.every((issue) => issue !== "too-close"
      && issue !== "too-far"
      && issue !== "feet-clipped"
      && issue !== "overhead-clipped");
  };
  const usable = input.samples.filter(sampleIsUsable);
  const stableTail: AdaptiveCameraSample[] = [];
  for (let index = input.samples.length - 1; index >= 0; index -= 1) {
    const sample = input.samples[index];
    if (!sampleIsUsable(sample)) break;
    stableTail.unshift(sample);
  }
  const usableSamplePercent = input.samples.length === 0
    ? 0
    : Math.round((usable.length / input.samples.length) * 100);
  const stableSeconds = stableTail.length < 2
    ? 0
    : Math.max(0, Math.round((stableTail.at(-1)!.timestampMs - stableTail[0].timestampMs) / 100) / 10);
  const movementReady = requirement.minCalibrationReps > 0
    ? input.calibrationReps >= requirement.minCalibrationReps
    : input.calibrationHoldSeconds >= requirement.minCalibrationHoldSeconds;
  const framingReady = stableSeconds >= requirement.minStableSeconds && usableSamplePercent >= 75;
  const ready = framingReady && movementReady;

  let advice = latest.framing.advice;
  if (latest.luminance !== null && latest.luminance < 45) {
    advice = "Mer ljus behövs. Vänd dig mot ljuset eller flytta kameran från motljuset.";
  } else if (requirement.requiredBody === "full_body" && !latest.fullBodyVisible) {
    advice = "Backa eller sänk kameran tills huvud, höfter och båda fötterna syns.";
  } else if (!requirement.acceptedStances.includes(latest.framing.stance)) {
    advice = requirement.preferredStance === "diagonal"
      ? "Vrid kroppen ungefär 45° mot kameran. Då syns djup och kroppslinje bättre."
      : "Vrid kroppen mer mot kameran så båda sidor syns.";
  } else if (framingReady && !movementReady) {
    advice = requirement.minCalibrationReps > 0
      ? `Gör ${Math.max(0, requirement.minCalibrationReps - input.calibrationReps)} lugn kalibreringsrepetition till.`
      : `Håll positionen ${Math.max(0, requirement.minCalibrationHoldSeconds - Math.floor(input.calibrationHoldSeconds))} sekunder till.`;
  } else if (!ready) {
    advice = `Stå kvar i bra position i ${Math.max(0, Math.ceil(requirement.minStableSeconds - stableSeconds))} sekunder till.`;
  } else {
    advice = "Uppställningen är klar för repräkning. Kalibreringsrörelserna nollställs före arbetssetet.";
  }

  return {
    observationLevel: ready ? "rep_counting" : "manual",
    ready,
    stableSeconds,
    usableSamplePercent,
    advice,
    reason: `${requirement.reason} ${requirement.unobservable}`,
    stance: latest.framing.stance,
    placement: latest.framing.placement,
  };
}

export function createSavedCameraSetupProfile(input: {
  id: string;
  environment: TrainingEnvironment;
  exerciseId: TrackableExerciseId;
  resolution: string;
  evaluation: AdaptiveCameraEvaluation;
  samples: readonly AdaptiveCameraSample[];
  calibratedAt: string;
}): SavedCameraSetupProfile | null {
  if (!input.evaluation.ready || !input.evaluation.stance || !input.evaluation.placement) return null;
  const luminanceSamples = input.samples
    .map((sample) => sample.luminance)
    .filter((value): value is number => value !== null);
  return {
    id: input.id,
    version: 1,
    environment: input.environment,
    exerciseId: input.exerciseId,
    stance: input.evaluation.stance,
    placement: input.evaluation.placement,
    resolution: input.resolution,
    observationLevel: input.evaluation.observationLevel,
    usableSamplePercent: input.evaluation.usableSamplePercent,
    averageLuminance: luminanceSamples.length === 0
      ? null
      : Math.round(luminanceSamples.reduce((sum, value) => sum + value, 0) / luminanceSamples.length),
    calibratedAt: input.calibratedAt,
  };
}

export function cameraEnvironmentAdvice(environment: TrainingEnvironment): string {
  if (environment === "outdoor_gym") return "Undvik motljus och placera telefonen stabilt utanför gångstråk.";
  if (environment === "grass") return "Kontrollera att telefonen står plant och inte kan välta i gräs eller vind.";
  if (environment === "home") return "Se till att hela rörelsen ryms utan möbler eller lampor i vägen.";
  if (environment === "forest") return "Sök jämnt ljus och undvik fläckigt solljus mellan träden.";
  if (environment === "gym") return "Placera kameran utanför andras träningsyta och undvik personer i bakgrunden.";
  return "Placera kameran stabilt och håll träningsytan fri.";
}
