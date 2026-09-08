import {
  PROJECT100_DAILY_MISSION_TEMPLATES,
  type Project100ExercisePurpose,
  type Project100MissionType,
  type Project100MovementPattern,
  type Project100ObservationLevel,
} from "./project100-training-mission";

export const PROJECT100_STIMULUS_LEVELS = [
  "not_assessable",
  "light",
  "likely_sufficient",
  "high_load",
] as const;

export type Project100StimulusLevel = (typeof PROJECT100_STIMULUS_LEVELS)[number];

export interface Project100StimulusSetInput {
  movementPattern: Project100MovementPattern | null;
  purpose: Project100ExercisePurpose | null;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  observationLevel: Project100ObservationLevel | null;
  romConfidence: number | null;
}

export interface Project100StimulusEvidence {
  relevantSets: number;
  totalReps: number;
  totalHoldSeconds: number;
  externalVolumeKg: number | null;
  averageRpe: number | null;
  estimatedRir: number | null;
  averageRomConfidence: number | null;
  priorWeeklySets: number;
  weeklySetsIncludingToday: number;
  dataGaps: string[];
}

export interface Project100StimulusArea {
  movementPattern: Project100MovementPattern;
  label: string;
  muscleGroupLabel: string;
  level: Project100StimulusLevel;
  explanation: string;
  evidence: Project100StimulusEvidence;
}

export interface Project100TrainingStimulusAssessment {
  level: Project100StimulusLevel;
  label: string;
  explanation: string;
  areas: Project100StimulusArea[];
  disclaimer: string;
}

const MUSCLE_GROUP_LABELS: Partial<Record<Project100MovementPattern, string>> = {
  horizontal_push: "Bröst och triceps",
  horizontal_pull: "Rygg och biceps",
  vertical_push: "Axlar och triceps",
  vertical_pull: "Lats och övre rygg",
  knee_dominant: "Framsida lår och säte",
  hip_dominant: "Baksida lår och säte",
  unilateral_lower: "Ben och säte, en sida i taget",
  calf_ankle: "Vader och fotled",
  core: "Bål",
  carry: "Grepp och bål",
};

export const PROJECT100_STIMULUS_LABELS: Record<Project100StimulusLevel, string> = {
  not_assessable: "Kan inte bedömas",
  light: "Lätt stimulans",
  likely_sufficient: "Troligen tillräcklig stimulans",
  high_load: "Hög belastning – mer är inte automatiskt bättre",
};

function roundedAverage(values: number[], decimals = 1): number | null {
  if (values.length === 0) return null;
  const factor = 10 ** decimals;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * factor) / factor;
}

function evidenceFor(
  sets: readonly Project100StimulusSetInput[],
  priorWeeklySets: number,
): Project100StimulusEvidence {
  const rpeValues = sets.flatMap((set) => set.rpe === null ? [] : [set.rpe]);
  const romValues = sets.flatMap((set) => {
    if (set.romConfidence !== null) return [set.romConfidence];
    return set.observationLevel === "full_coaching" ? [0.85] : [];
  });
  const weightedSets = sets.filter((set) => set.reps !== null && set.weightKg !== null);
  const averageRpe = roundedAverage(rpeValues);
  const averageRomConfidence = roundedAverage(romValues, 2);
  const dataGaps: string[] = [];
  if (sets.length === 0) dataGaps.push("Inga relevanta arbetsset är loggade.");
  if (sets.length > 0 && rpeValues.length < sets.length) dataGaps.push("RPE saknas för ett eller flera set.");
  if (sets.length > 0 && romValues.length < sets.length) dataGaps.push("ROM-confidence saknas för ett eller flera set.");

  return {
    relevantSets: sets.length,
    totalReps: sets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    totalHoldSeconds: sets.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0),
    externalVolumeKg: weightedSets.length === 0
      ? null
      : Math.round(weightedSets.reduce(
          (sum, set) => sum + (set.reps ?? 0) * (set.weightKg ?? 0),
          0,
        ) * 10) / 10,
    averageRpe,
    estimatedRir: averageRpe === null ? null : Math.max(0, Math.round((10 - averageRpe) * 10) / 10),
    averageRomConfidence,
    priorWeeklySets,
    weeklySetsIncludingToday: priorWeeklySets + sets.length,
    dataGaps,
  };
}

function classifyArea(evidence: Project100StimulusEvidence): Pick<Project100StimulusArea, "level" | "explanation"> {
  if (
    evidence.relevantSets === 0 ||
    evidence.averageRpe === null ||
    evidence.averageRomConfidence === null ||
    evidence.dataGaps.some((gap) => gap.startsWith("RPE ") || gap.startsWith("ROM-confidence "))
  ) {
    return {
      level: "not_assessable",
      explanation: "Set, ansträngning och observerbar rörelse behövs innan stimulansen kan bedömas.",
    };
  }

  const hardEnoughSets = evidence.averageRpe >= 7;
  if (
    evidence.relevantSets >= 6 ||
    evidence.weeklySetsIncludingToday >= 14 ||
    (evidence.relevantSets >= 4 && evidence.averageRpe >= 9)
  ) {
    return {
      level: "high_load",
      explanation: "Dosen eller den rapporterade ansträngningen är redan hög. Lägg inte till set bara för att höja en poäng.",
    };
  }
  if (
    evidence.relevantSets >= 2 &&
    hardEnoughSets &&
    evidence.averageRomConfidence >= 0.55
  ) {
    return {
      level: "likely_sufficient",
      explanation: "Flera relevanta arbetsset kombinerar rimlig ansträngning med ett användbart ROM-underlag.",
    };
  }
  return {
    level: "light",
    explanation: "Arbete är gjort, men dosen, ansträngningen eller ROM-underlaget är ännu begränsat.",
  };
}

export function assessProject100TrainingStimulus(input: {
  missionType: Project100MissionType;
  sets: readonly Project100StimulusSetInput[];
  priorWeeklySets?: Partial<Record<Project100MovementPattern, number>>;
}): Project100TrainingStimulusAssessment {
  const relevantSets = input.sets.filter((set) => set.purpose === "strength_hypertrophy");
  const areas = PROJECT100_DAILY_MISSION_TEMPLATES[input.missionType].requirements.map((requirement) => {
    const sets = relevantSets.filter((set) => set.movementPattern === requirement.movementPattern);
    const evidence = evidenceFor(sets, Math.max(0, input.priorWeeklySets?.[requirement.movementPattern] ?? 0));
    const classification = classifyArea(evidence);
    return {
      movementPattern: requirement.movementPattern,
      label: requirement.label,
      muscleGroupLabel: MUSCLE_GROUP_LABELS[requirement.movementPattern] ?? requirement.label,
      ...classification,
      evidence,
    };
  });

  const activeAreas = areas.filter((area) => area.evidence.relevantSets > 0);
  const likelyAreas = activeAreas.filter((area) => area.level === "likely_sufficient");
  let level: Project100StimulusLevel = "not_assessable";
  let explanation = "Inga relevanta styrkeset finns att bedöma ännu.";
  if (activeAreas.some((area) => area.level === "high_load")) {
    level = "high_load";
    explanation = "Minst ett område har redan hög dos eller mycket hög rapporterad ansträngning.";
  } else if (likelyAreas.length >= 2) {
    level = "likely_sufficient";
    explanation = "Minst två av uppdragets områden har flera ansträngande set med användbart ROM-underlag.";
  } else if (activeAreas.some((area) => area.level !== "not_assessable")) {
    level = "light";
    explanation = "Träning är gjord, men hela passets underlag räcker ännu inte för en starkare bedömning.";
  } else if (activeAreas.length > 0) {
    explanation = "Träning är loggad, men RPE eller ROM-confidence saknas för att bedöma passets stimulans.";
  }

  return {
    level,
    label: PROJECT100_STIMULUS_LABELS[level],
    explanation,
    areas,
    disclaimer: "Detta är en försiktig bedömning av träningsstimulus – inte en garanti för framtida muskeltillväxt.",
  };
}
