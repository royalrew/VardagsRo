import type {
  Project100MissionType,
  Project100TrainingEnvironment,
  Project100TrainingSource,
} from "./project100-training-mission";

export const PROJECT100_LIVE_GATE_MIN_BLOCKS = 3;
export const PROJECT100_LIVE_GATE_MIN_ENVIRONMENTS = 2;

export interface Project100LiveGateAttemptInput {
  id: string;
  missionType: Project100MissionType;
  status: "planned" | "in_progress" | "completed" | "skipped";
  sessionDate: string;
  coveragePercentage: number;
  blocks: Array<{
    id: string;
    environment: Project100TrainingEnvironment;
    source: Project100TrainingSource;
  }>;
}

export interface Project100LiveGateCheck {
  id: "completed" | "coverage" | "blocks" | "environments";
  label: string;
  passed: boolean;
  actual: string;
}

export interface Project100LiveGateMissionAssessment {
  missionType: Project100MissionType;
  label: string;
  passed: boolean;
  attemptId: string | null;
  sessionDate: string | null;
  coveragePercentage: number;
  blockCount: number;
  environments: Project100TrainingEnvironment[];
  sources: Project100TrainingSource[];
  checks: Project100LiveGateCheck[];
  nextAction: string;
}

export interface Project100TrainingLiveGateAssessment {
  passed: boolean;
  passedMissionCount: number;
  requiredMissionCount: 2;
  missions: Record<Project100MissionType, Project100LiveGateMissionAssessment>;
  explanation: string;
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

function checksFor(attempt: Project100LiveGateAttemptInput | null): Project100LiveGateCheck[] {
  const blockCount = attempt?.blocks.length ?? 0;
  const environmentCount = uniqueSorted(attempt?.blocks.map((block) => block.environment) ?? []).length;
  const coverage = attempt?.coveragePercentage ?? 0;
  return [
    {
      id: "completed",
      label: "Uppdrag avslutat",
      passed: attempt?.status === "completed",
      actual: attempt?.status === "completed" ? "Ja" : "Inte än",
    },
    {
      id: "coverage",
      label: "Plantäckning",
      passed: coverage === 100,
      actual: `${coverage}%`,
    },
    {
      id: "blocks",
      label: "Minst tre block",
      passed: blockCount >= PROJECT100_LIVE_GATE_MIN_BLOCKS,
      actual: `${blockCount}/${PROJECT100_LIVE_GATE_MIN_BLOCKS}`,
    },
    {
      id: "environments",
      label: "Minst två miljöer",
      passed: environmentCount >= PROJECT100_LIVE_GATE_MIN_ENVIRONMENTS,
      actual: `${environmentCount}/${PROJECT100_LIVE_GATE_MIN_ENVIRONMENTS}`,
    },
  ];
}

function attemptScore(attempt: Project100LiveGateAttemptInput): readonly number[] {
  const checks = checksFor(attempt);
  return [
    checks.filter((check) => check.passed).length,
    attempt.coveragePercentage,
    Math.min(attempt.blocks.length, PROJECT100_LIVE_GATE_MIN_BLOCKS),
    Math.min(uniqueSorted(attempt.blocks.map((block) => block.environment)).length, PROJECT100_LIVE_GATE_MIN_ENVIRONMENTS),
  ];
}

function compareAttempts(left: Project100LiveGateAttemptInput, right: Project100LiveGateAttemptInput): number {
  const leftScore = attemptScore(left);
  const rightScore = attemptScore(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) return rightScore[index] - leftScore[index];
  }
  return right.sessionDate.localeCompare(left.sessionDate) || right.id.localeCompare(left.id);
}

function nextActionFor(
  missionType: Project100MissionType,
  attempt: Project100LiveGateAttemptInput | null,
  checks: Project100LiveGateCheck[],
): string {
  const label = missionType === "upper" ? "överkroppsuppdrag" : "underkroppsuppdrag";
  if (!attempt) return `Genomför ett ${label} och dela upp det i minst tre block i två miljöer.`;
  if (!checks.find((check) => check.id === "blocks")?.passed) {
    return `Logga ${PROJECT100_LIVE_GATE_MIN_BLOCKS - attempt.blocks.length} block till i samma ${label}.`;
  }
  if (!checks.find((check) => check.id === "environments")?.passed) {
    return "Logga nästa block i en annan miljö, till exempel hemma, på gräs eller utegym.";
  }
  if (!checks.find((check) => check.id === "coverage")?.passed) {
    return `Fyll återstående rörelsemönster tills uppdraget når 100% plantäckning.`;
  }
  if (!checks.find((check) => check.id === "completed")?.passed) {
    return "Avsluta uppdraget när dagens verkliga arbete är färdigt.";
  }
  return "Live-gaten är godkänd för den här uppdragstypen.";
}

function assessMission(
  missionType: Project100MissionType,
  attempts: Project100LiveGateAttemptInput[],
): Project100LiveGateMissionAssessment {
  const attempt = attempts.filter((item) => item.missionType === missionType).sort(compareAttempts)[0] ?? null;
  const checks = checksFor(attempt);
  const environments = uniqueSorted(attempt?.blocks.map((block) => block.environment) ?? []);
  const passed = checks.every((check) => check.passed);
  return {
    missionType,
    label: missionType === "upper" ? "Överkropp" : "Underkropp",
    passed,
    attemptId: attempt?.id ?? null,
    sessionDate: attempt?.sessionDate ?? null,
    coveragePercentage: attempt?.coveragePercentage ?? 0,
    blockCount: attempt?.blocks.length ?? 0,
    environments,
    sources: uniqueSorted(attempt?.blocks.map((block) => block.source) ?? []),
    checks,
    nextAction: nextActionFor(missionType, attempt, checks),
  };
}

/**
 * K8 is derived only from persisted mission evidence. There is deliberately no
 * mutable "approved" flag that could drift away from the underlying blocks.
 */
export function assessProject100TrainingLiveGate(
  attempts: Project100LiveGateAttemptInput[],
): Project100TrainingLiveGateAssessment {
  const upper = assessMission("upper", attempts);
  const lower = assessMission("lower", attempts);
  const passedMissionCount = Number(upper.passed) + Number(lower.passed);
  return {
    passed: passedMissionCount === 2,
    passedMissionCount,
    requiredMissionCount: 2,
    missions: { upper, lower },
    explanation: passedMissionCount === 2
      ? "K8 är verifierad med två verkliga, kompletta uppdrag."
      : "Koden är klar. K8 godkänns först när verkliga loggar uppfyller alla kontroller för både över- och underkropp.",
  };
}
