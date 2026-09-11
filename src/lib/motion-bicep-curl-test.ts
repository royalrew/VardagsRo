import type {
  BicepCurlTrackerState,
  BicepCurlTrajectorySample,
} from "./motion-library";

export interface BicepCurlTestReport {
  exercise: "bicep-curl";
  testVersion: "1.0-calibration";
  testedAt: string;
  totalReps: number;
  activeArm: "left" | "right" | "both" | null;
  currentElbowAngle: number;
  currentLeftAngle: number;
  currentRightAngle: number;
  armDistribution: {
    left: number;
    right: number;
    both: number;
  };
  reps: Array<{
    repNumber: number;
    arm: "left" | "right" | "both";
    durationSeconds: number;
    minElbowAngle: number;
    extensionElbowAngle: number;
    contractionPassed: boolean;
    swayWarning: boolean;
  }>;
  summary: {
    averageDurationSeconds: number;
    averageMinAngle: number;
    averageExtensionAngle: number;
    contractionSuccessRatePercent: number;
    passedRepsCount: number;
  };
  trajectorySampleCount: number;
  trajectorySamples: BicepCurlTrajectorySample[];
  guidance: {
    cameraAngle: string;
    recommendedHeight: string;
    recommendedDistance: string;
    targetContractionDeg: string;
    targetExtensionDeg: string;
  };
  evaluationNotes: string[];
}

export function buildBicepCurlTestReport(
  state: BicepCurlTrackerState,
  testedAt: string = new Date().toISOString(),
): BicepCurlTestReport {
  const repsHistory = state.repsHistory ?? [];
  const reps = repsHistory.map((rep) => {
    const contractionPassed = rep.minElbowAngle <= 106;

    return {
      repNumber: rep.repNumber,
      arm: rep.arm,
      durationSeconds: Math.round((rep.durationMs / 1000) * 10) / 10,
      minElbowAngle: rep.minElbowAngle,
      extensionElbowAngle: rep.extensionElbowAngle,
      contractionPassed,
      swayWarning: rep.swayWarning,
    };
  });

  const passedReps = reps.filter((r) => r.contractionPassed);
  const totalReps = reps.length;

  const armDistribution = {
    left: reps.filter((r) => r.arm === "left").length,
    right: reps.filter((r) => r.arm === "right").length,
    both: reps.filter((r) => r.arm === "both").length,
  };

  const avgDuration =
    reps.length > 0
      ? Math.round(
          (reps.reduce((sum, r) => sum + r.durationSeconds, 0) / reps.length) * 10,
        ) / 10
      : 0;

  const avgMinAngle =
    reps.length > 0
      ? Math.round(
          reps.reduce((sum, r) => sum + r.minElbowAngle, 0) / reps.length,
        )
      : 0;

  const avgExtension =
    reps.length > 0
      ? Math.round(
          reps.reduce((sum, r) => sum + r.extensionElbowAngle, 0) / reps.length,
        )
      : 0;

  const contractionSuccessRate =
    totalReps > 0 ? Math.round((passedReps.length / totalReps) * 100) : 0;

  const notes: string[] = [];
  if (totalReps === 0) {
    notes.push("Inga repetitioner slutfördes under testet.");
  } else {
    notes.push(
      `Totalt ${totalReps} repetitioner registrerade (${armDistribution.right} höger, ${armDistribution.left} vänster, ${armDistribution.both} båda).`,
    );
    if (contractionSuccessRate >= 80) {
      notes.push("Utmärkt toppkontraktion och rörelseomfång vid curl.");
    } else {
      notes.push(
        "Vissa repetitioner nådde inte full kontraktion (<= 106° armbågsvinkel).",
      );
    }
  }

  return {
    exercise: "bicep-curl",
    testVersion: "1.0-calibration",
    testedAt,
    totalReps,
    activeArm: state.activeArm ?? null,
    currentElbowAngle: state.lastAngle ?? 155,
    currentLeftAngle: state.leftAngle ?? 155,
    currentRightAngle: state.rightAngle ?? 155,
    armDistribution,
    reps,
    summary: {
      averageDurationSeconds: avgDuration,
      averageMinAngle: avgMinAngle,
      averageExtensionAngle: avgExtension,
      contractionSuccessRatePercent: contractionSuccessRate,
      passedRepsCount: passedReps.length,
    },
    trajectorySampleCount: (state.trajectorySamples ?? []).length,
    trajectorySamples: state.trajectorySamples ?? [],
    guidance: {
      cameraAngle: "Framifrån (rekommenderas) eller 45° diagonal",
      recommendedHeight: "Höft- till brösthöjd (0.9 - 1.2 m)",
      recommendedDistance: "2.0 - 2.5 m (överkropp och armar fullt synliga)",
      targetContractionDeg: "<= 106° i toppläget vid axeln/bröstet",
      targetExtensionDeg: ">= 118° i bottenläget längs kroppen",
    },
    evaluationNotes: notes,
  };
}
