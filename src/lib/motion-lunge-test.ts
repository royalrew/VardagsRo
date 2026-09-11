import type {
  LungeTrackerState,
  LungeTrajectorySample,
} from "./motion-exercises";

export interface LungeTestReport {
  exercise: "lunge";
  testVersion: "1.0-calibration";
  testedAt: string;
  totalReps: number;
  activeLeadLeg: "left" | "right" | null;
  currentKneeAngle: number;
  leadLegDistribution: {
    left: number;
    right: number;
  };
  reps: Array<{
    repNumber: number;
    leadLeg: "left" | "right";
    durationSeconds: number;
    minKneeAngle: number;
    lockoutKneeAngle: number;
    depthTargetPassed: boolean;
    lockoutPassed: boolean;
  }>;
  summary: {
    averageDurationSeconds: number;
    averageMinKneeAngle: number;
    depthSuccessRatePercent: number;
    passedRepsCount: number;
  };
  trajectorySampleCount: number;
  trajectorySamples: LungeTrajectorySample[];
  guidance: {
    cameraAngle: string;
    recommendedHeight: string;
    recommendedDistance: string;
    targetBottomKneeDeg: string;
    targetTopKneeDeg: string;
  };
  evaluationNotes: string[];
}

export function buildLungeTestReport(
  state: LungeTrackerState,
  testedAt: string = new Date().toISOString(),
): LungeTestReport {
  const repsHistory = state.repsHistory ?? [];
  const reps = repsHistory.map((rep) => {
    const depthTargetPassed = rep.minKneeAngle <= 105;
    const lockoutPassed = rep.lockoutKneeAngle >= 150;

    return {
      repNumber: rep.repNumber,
      leadLeg: rep.leadLeg,
      durationSeconds: Math.round((rep.durationMs / 1000) * 10) / 10,
      minKneeAngle: rep.minKneeAngle,
      lockoutKneeAngle: rep.lockoutKneeAngle,
      depthTargetPassed,
      lockoutPassed,
    };
  });

  const passedRepsCount = reps.filter((r) => r.depthTargetPassed && r.lockoutPassed).length;
  const totalReps = reps.length;

  const leftCount = reps.filter((r) => r.leadLeg === "left").length;
  const rightCount = reps.filter((r) => r.leadLeg === "right").length;

  const averageDurationSeconds =
    totalReps > 0
      ? Math.round((reps.reduce((s, r) => s + r.durationSeconds, 0) / totalReps) * 10) / 10
      : 0;

  const averageMinKneeAngle =
    totalReps > 0
      ? Math.round(reps.reduce((s, r) => s + r.minKneeAngle, 0) / totalReps)
      : state.kneeAngle;

  const depthSuccessRatePercent =
    totalReps > 0 ? Math.round((reps.filter((r) => r.depthTargetPassed).length / totalReps) * 100) : 0;

  const evaluationNotes: string[] = [];
  if (totalReps === 0) {
    evaluationNotes.push(
      "Inga repetitioner registrerades ännu. Kontrollera att främre knät böjs under 105° i botten och sträcks ut över 150° i toppen.",
    );
  } else {
    if (depthSuccessRatePercent >= 80) {
      evaluationNotes.push(
        "Utmärkt djup: över 80% av utfallet nådde under 105° knävinkel.",
      );
    } else {
      evaluationNotes.push(
        `Djup kan förbättras: ${depthSuccessRatePercent}% av repetitionerna nådde under 105°. Snittminsta knävinkel var ${averageMinKneeAngle}°.`,
      );
    }

    if (leftCount > 0 && rightCount > 0) {
      evaluationNotes.push(`Balanserad bilateral träning: ${leftCount} vänster och ${rightCount} höger.`);
    } else if (leftCount > 0) {
      evaluationNotes.push(`Bara vänster ben registrerades som ledande (${leftCount} reps).`);
    } else if (rightCount > 0) {
      evaluationNotes.push(`Bara höger ben registrerades som ledande (${rightCount} reps).`);
    }
  }

  return {
    exercise: "lunge",
    testVersion: "1.0-calibration",
    testedAt,
    totalReps,
    activeLeadLeg: state.leadLeg,
    currentKneeAngle: state.kneeAngle,
    leadLegDistribution: {
      left: leftCount,
      right: rightCount,
    },
    reps,
    summary: {
      averageDurationSeconds,
      averageMinKneeAngle,
      depthSuccessRatePercent,
      passedRepsCount,
    },
    trajectorySampleCount: (state.trajectorySamples ?? []).length,
    trajectorySamples: state.trajectorySamples ?? [],
    guidance: {
      cameraAngle: "snett (30°–45°) mot skärmen/TV:n",
      recommendedHeight: "ca 40–80 cm från golvet",
      recommendedDistance: "1.8–2.5 meter från kameran",
      targetBottomKneeDeg: "<= 100° (knä i ca 90°)",
      targetTopKneeDeg: ">= 155° (full upprätning)",
    },
    evaluationNotes,
  };
}
