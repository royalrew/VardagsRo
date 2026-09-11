import type {
  OverheadPressTrackerState,
  OverheadPressTrajectorySample,
} from "./motion-library";

export interface OverheadPressTestReport {
  exercise: "overhead-press";
  testVersion: "1.0-calibration";
  testedAt: string;
  totalReps: number;
  activeArm: "left" | "right" | "both" | null;
  currentArmAngle: number;
  armDistribution: {
    left: number;
    right: number;
    both: number;
  };
  reps: Array<{
    repNumber: number;
    arm: "left" | "right" | "both";
    durationSeconds: number;
    minArmAngle: number;
    lockoutArmAngle: number;
    lockoutPassed: boolean;
  }>;
  summary: {
    averageDurationSeconds: number;
    averageLockoutAngle: number;
    lockoutSuccessRatePercent: number;
    passedRepsCount: number;
  };
  trajectorySampleCount: number;
  trajectorySamples: OverheadPressTrajectorySample[];
  guidance: {
    cameraAngle: string;
    recommendedHeight: string;
    recommendedDistance: string;
    targetLockoutDeg: string;
  };
  evaluationNotes: string[];
}

export function buildOverheadPressTestReport(
  state: OverheadPressTrackerState,
  testedAt: string = new Date().toISOString(),
): OverheadPressTestReport {
  const repsHistory = state.repsHistory ?? [];
  const reps = repsHistory.map((rep) => {
    const lockoutPassed = rep.lockoutArmAngle >= 145;

    return {
      repNumber: rep.repNumber,
      arm: rep.arm,
      durationSeconds: Math.round((rep.durationMs / 1000) * 10) / 10,
      minArmAngle: rep.minArmAngle,
      lockoutArmAngle: rep.lockoutArmAngle,
      lockoutPassed,
    };
  });

  const passedRepsCount = reps.filter((r) => r.lockoutPassed).length;
  const totalReps = reps.length;

  const leftCount = reps.filter((r) => r.arm === "left").length;
  const rightCount = reps.filter((r) => r.arm === "right").length;
  const bothCount = reps.filter((r) => r.arm === "both").length;

  const averageDurationSeconds =
    totalReps > 0
      ? Math.round((reps.reduce((s, r) => s + r.durationSeconds, 0) / totalReps) * 10) / 10
      : 0;

  const averageLockoutAngle =
    totalReps > 0
      ? Math.round(reps.reduce((s, r) => s + r.lockoutArmAngle, 0) / totalReps)
      : state.lastArmAngle;

  const lockoutSuccessRatePercent =
    totalReps > 0 ? Math.round((passedRepsCount / totalReps) * 100) : 0;

  const evaluationNotes: string[] = [];
  if (totalReps === 0) {
    evaluationNotes.push(
      "Inga repetitioner registrerades ännu. Pressa armarna rakt upp ovanför huvudet till minst 148° utlåsning och sänk ner till axelhöjd.",
    );
  } else {
    if (lockoutSuccessRatePercent >= 80) {
      evaluationNotes.push(
        "Stark utlåsning: över 80% av pressarna nådde fullgod sträckning över huvudet (>= 145°).",
      );
    } else {
      evaluationNotes.push(
        `Utlåsning kan förbättras: ${lockoutSuccessRatePercent}% nådde över 145°. Snittutlåsning var ${averageLockoutAngle}°.`,
      );
    }

    const armNotes: string[] = [];
    if (leftCount > 0) armNotes.push(`${leftCount} med vänster arm`);
    if (rightCount > 0) armNotes.push(`${rightCount} med höger arm`);
    if (bothCount > 0) armNotes.push(`${bothCount} med båda armarna`);
    if (armNotes.length > 0) {
      evaluationNotes.push(`Armfördelning: ${armNotes.join(", ")}.`);
    }
  }

  return {
    exercise: "overhead-press",
    testVersion: "1.0-calibration",
    testedAt,
    totalReps,
    activeArm: state.activeArm ?? "both",
    currentArmAngle: state.lastArmAngle,
    armDistribution: {
      left: leftCount,
      right: rightCount,
      both: bothCount,
    },
    reps,
    summary: {
      averageDurationSeconds,
      averageLockoutAngle,
      lockoutSuccessRatePercent,
      passedRepsCount,
    },
    trajectorySampleCount: (state.trajectorySamples ?? []).length,
    trajectorySamples: state.trajectorySamples ?? [],
    guidance: {
      cameraAngle: "framifrån mot skärmen/TV:n",
      recommendedHeight: "ca 60–100 cm från golvet",
      recommendedDistance: "2.0–2.8 meter (så händerna ryms i bild vid toppläge)",
      targetLockoutDeg: ">= 148° (nära raka armar över huvudet)",
    },
    evaluationNotes,
  };
}
