import type {
  LateralRaiseTrackerState,
  LateralRaiseTrajectorySample,
} from "./motion-library";

export interface LateralRaiseTestReport {
  exercise: "lateral-raise";
  testVersion: "1.1-bilateral-sync";
  testedAt: string;
  totalReps: number;
  activeArm: "left" | "right" | "both";
  currentAngle: number;
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
    peakAngle: number;
    bottomAngle: number;
    heightPassed: boolean;
    overshootWarning: boolean;
  }>;
  summary: {
    averageDurationSeconds: number;
    averagePeakAngle: number;
    heightSuccessRatePercent: number;
    overshootCount: number;
    passedRepsCount: number;
  };
  trajectorySampleCount: number;
  trajectorySamples: LateralRaiseTrajectorySample[];
  trackingDiagnostics: {
    status: LateralRaiseTrackerState["trackingStatus"];
    ready: boolean;
    rejectedFrameCount: number;
    trackingLossEvents: number;
    lastIssue: LateralRaiseTrackerState["trackingIssue"] | null;
    rejectedFrameReasons: LateralRaiseTrackerState["rejectedFrameReasons"];
  };
  guidance: {
    cameraAngle: string;
    recommendedHeight: string;
    recommendedDistance: string;
    targetPeakAngle: string;
    targetBottomAngle: string;
  };
  evaluationNotes: string[];
}

export function buildLateralRaiseTestReport(
  state: LateralRaiseTrackerState,
  testedAt: string = new Date().toISOString(),
): LateralRaiseTestReport {
  const reps = state.repsHistory.map((rep) => ({
    repNumber: rep.repNumber,
    arm: rep.arm,
    durationSeconds: Math.round((rep.durationMs / 1_000) * 10) / 10,
    peakAngle: rep.peakAngle,
    bottomAngle: rep.bottomAngle,
    heightPassed: rep.heightPassed,
    overshootWarning: rep.overshootWarning,
  }));
  const totalReps = reps.length;
  const passedReps = reps.filter((rep) => rep.heightPassed && !rep.overshootWarning);
  const overshootCount = reps.filter((rep) => rep.overshootWarning).length;
  const armDistribution = {
    left: reps.filter((rep) => rep.arm === "left").length,
    right: reps.filter((rep) => rep.arm === "right").length,
    both: reps.filter((rep) => rep.arm === "both").length,
  };
  const averageDurationSeconds = totalReps > 0
    ? Math.round((reps.reduce((sum, rep) => sum + rep.durationSeconds, 0) / totalReps) * 10) / 10
    : 0;
  const averagePeakAngle = totalReps > 0
    ? Math.round(reps.reduce((sum, rep) => sum + rep.peakAngle, 0) / totalReps)
    : 0;
  const heightSuccessRatePercent = totalReps > 0
    ? Math.round((reps.filter((rep) => rep.heightPassed).length / totalReps) * 100)
    : 0;

  const evaluationNotes: string[] = [];
  if (totalReps === 0) {
    evaluationNotes.push("Inga sidolyft registrerades under testet.");
  } else {
    evaluationNotes.push(
      `${totalReps} repetitioner registrerades (${armDistribution.right} höger, ${armDistribution.left} vänster, ${armDistribution.both} båda).`,
    );
    evaluationNotes.push(
      `${heightSuccessRatePercent}% nådde minst 80° lyftvinkel; ${overshootCount} lyft gick över rekommenderad axelhöjd.`,
    );
  }
  if (state.rejectedFrameCount > 0) {
    evaluationNotes.push(
      `${state.rejectedFrameCount} osäkra bildrutor ignorerades vid ${state.trackingLossEvents} spårningsavbrott.`,
    );
  }
  if (!state.hasEstablishedBottom) {
    evaluationNotes.push("Räknaren väntar på ett stabilt bottenläge med båda armarna längs sidorna.");
  }

  return {
    exercise: "lateral-raise",
    testVersion: "1.1-bilateral-sync",
    testedAt,
    totalReps,
    activeArm: state.activeArm,
    currentAngle: state.lastAbductionAngle,
    currentLeftAngle: state.leftAbductionAngle,
    currentRightAngle: state.rightAbductionAngle,
    armDistribution,
    reps,
    summary: {
      averageDurationSeconds,
      averagePeakAngle,
      heightSuccessRatePercent,
      overshootCount,
      passedRepsCount: passedReps.length,
    },
    trajectorySampleCount: state.trajectorySamples.length,
    trajectorySamples: state.trajectorySamples,
    trackingDiagnostics: {
      status: state.trackingStatus,
      ready: state.hasEstablishedBottom,
      rejectedFrameCount: state.rejectedFrameCount,
      trackingLossEvents: state.trackingLossEvents,
      lastIssue: state.trackingIssue ?? null,
      rejectedFrameReasons: state.rejectedFrameReasons,
    },
    guidance: {
      cameraAngle: "Framifrån",
      recommendedHeight: "Höft- till brösthöjd",
      recommendedDistance: "2.0–2.5 meter med hela armarna synliga",
      targetPeakAngle: "80°–105°; lyft till axelhöjd men inte högre",
      targetBottomAngle: "<= 38° med händerna längs låren",
    },
    evaluationNotes,
  };
}
