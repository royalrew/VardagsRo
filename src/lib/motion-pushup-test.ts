import type {
  PushupTrackerState,
  PushupTrajectorySample,
} from "./motion-exercises";

export interface PushupTestReport {
  exercise: "pushup";
  testVersion: "1.0-calibration";
  testedAt: string;
  totalReps: number;
  sideFacingCamera: "left" | "right";
  currentElbowAngle: number;
  currentBodyLineDeg: number;
  reps: Array<{
    repNumber: number;
    durationSeconds: number;
    minElbowAngle: number;
    lockoutElbowAngle: number;
    minBodyAlignmentDeg: number;
    depthTargetPassed: boolean;
    lockoutPassed: boolean;
    bodyAlignmentPassed: boolean;
    isFormWarning: boolean;
    formMessage: string | null;
  }>;
  summary: {
    averageDurationSeconds: number;
    averageMinElbowAngle: number;
    averageBodyAlignment: number;
    depthSuccessRatePercent: number;
    passedRepsCount: number;
  };
  trajectorySampleCount: number;
  trajectorySamples: PushupTrajectorySample[];
  guidance: {
    cameraAngle: "side (profil)";
    recommendedHeight: "40–70 cm från golvet";
    recommendedDistance: "2.0–2.5 meter";
    targetBottomElbowDeg: "<= 95°";
    targetTopElbowDeg: ">= 150°";
    targetBodyLineDeg: ">= 145°";
  };
  evaluationNotes: string[];
}

export function buildPushupTestReport(
  state: PushupTrackerState,
  testedAt: string = new Date().toISOString(),
): PushupTestReport {
  const reps = state.repsHistory.map((rep) => {
    const depthTargetPassed = rep.minElbowAngle <= 95;
    const lockoutPassed = rep.lockoutElbowAngle >= 150;
    const bodyAlignmentPassed = rep.minBodyAlignmentDeg >= 145;

    return {
      repNumber: rep.repNumber,
      durationSeconds: Math.round((rep.durationMs / 1000) * 10) / 10,
      minElbowAngle: rep.minElbowAngle,
      lockoutElbowAngle: rep.lockoutElbowAngle,
      minBodyAlignmentDeg: rep.minBodyAlignmentDeg,
      depthTargetPassed,
      lockoutPassed,
      bodyAlignmentPassed,
      isFormWarning: rep.isFormWarning || !bodyAlignmentPassed,
      formMessage: rep.formMessage,
    };
  });

  const passedRepsCount = reps.filter(
    (r) => r.depthTargetPassed && r.lockoutPassed && r.bodyAlignmentPassed,
  ).length;

  const totalReps = reps.length;
  const averageDurationSeconds =
    totalReps > 0
      ? Math.round((reps.reduce((s, r) => s + r.durationSeconds, 0) / totalReps) * 10) / 10
      : 0;
  const averageMinElbowAngle =
    totalReps > 0
      ? Math.round(reps.reduce((s, r) => s + r.minElbowAngle, 0) / totalReps)
      : state.elbowAngle;
  const averageBodyAlignment =
    totalReps > 0
      ? Math.round(reps.reduce((s, r) => s + r.minBodyAlignmentDeg, 0) / totalReps)
      : state.bodyAlignmentDeg;
  const depthSuccessRatePercent =
    totalReps > 0 ? Math.round((reps.filter((r) => r.depthTargetPassed).length / totalReps) * 100) : 0;

  const evaluationNotes: string[] = [];
  if (totalReps === 0) {
    evaluationNotes.push("Inga repetitioner registrerades ännu. Kontrollera att armbågarna böjs under 95° och rätas ut över 150°.");
  } else {
    if (depthSuccessRatePercent >= 80) {
      evaluationNotes.push("Utmärkt djup: över 80% av repetitionerna nådde under 95° armbågsvinkel.");
    } else {
      evaluationNotes.push(`Djup kan förbättras: ${depthSuccessRatePercent}% av repsen nådde under 95°. Snittminsta vinkel var ${averageMinElbowAngle}°.`);
    }

    if (averageBodyAlignment >= 155) {
      evaluationNotes.push("Stark och stabil planklinje genom rörelsen.");
    } else if (averageBodyAlignment < 145) {
      evaluationNotes.push("Bållinjen vek sig bitvis (höftlyft eller hängande rygg under 145°).");
    }
  }

  return {
    exercise: "pushup",
    testVersion: "1.0-calibration",
    testedAt,
    totalReps,
    sideFacingCamera: state.side,
    currentElbowAngle: state.elbowAngle,
    currentBodyLineDeg: state.bodyAlignmentDeg,
    reps,
    summary: {
      averageDurationSeconds,
      averageMinElbowAngle,
      averageBodyAlignment,
      depthSuccessRatePercent,
      passedRepsCount,
    },
    trajectorySampleCount: state.trajectorySamples.length,
    trajectorySamples: state.trajectorySamples,
    guidance: {
      cameraAngle: "side (profil)",
      recommendedHeight: "40–70 cm från golvet",
      recommendedDistance: "2.0–2.5 meter",
      targetBottomElbowDeg: "<= 95°",
      targetTopElbowDeg: ">= 150°",
      targetBodyLineDeg: ">= 145°",
    },
    evaluationNotes,
  };
}
