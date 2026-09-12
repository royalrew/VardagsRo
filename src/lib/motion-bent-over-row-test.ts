import type {
  BentOverRowTrackerState,
  BentOverRowTrajectorySample,
} from "./motion-library";

export interface BentOverRowTestReport {
  exercise: "bent-over-row";
  testVersion: "1.2-stable-rearm";
  testedAt: string;
  totalReps: number;
  currentLeftElbowAngle: number;
  currentRightElbowAngle: number;
  currentTorsoAngle: number;
  reps: Array<{
    repNumber: number;
    durationSeconds: number;
    minLeftElbowAngle: number;
    minRightElbowAngle: number;
    extensionAngle: number;
    torsoAngle: number;
    contractionPassed: boolean;
    hingePassed: boolean;
  }>;
  summary: {
    averageDurationSeconds: number;
    averageContractionAngle: number;
    averageTorsoAngle: number;
    contractionSuccessRatePercent: number;
    hingeSuccessRatePercent: number;
    passedRepsCount: number;
  };
  trajectorySampleCount: number;
  trajectorySamples: BentOverRowTrajectorySample[];
  trackingDiagnostics: {
    status: BentOverRowTrackerState["trackingStatus"];
    ready: boolean;
    armedForNextRep: boolean;
    rejectedFrameCount: number;
    trackingLossEvents: number;
    lastIssue: BentOverRowTrackerState["trackingIssue"] | null;
    rejectedFrameReasons: BentOverRowTrackerState["rejectedFrameReasons"];
  };
  guidance: {
    cameraAngle: string;
    recommendedDistance: string;
    targetContractionAngle: string;
    targetExtensionAngle: string;
    torsoCue: string;
  };
  evaluationNotes: string[];
}

export function buildBentOverRowTestReport(
  state: BentOverRowTrackerState,
  testedAt: string = new Date().toISOString(),
): BentOverRowTestReport {
  const reps = state.repsHistory.map((rep) => ({
    repNumber: rep.repNumber,
    durationSeconds: Math.round((rep.durationMs / 1_000) * 10) / 10,
    minLeftElbowAngle: rep.minLeftElbowAngle,
    minRightElbowAngle: rep.minRightElbowAngle,
    extensionAngle: rep.extensionAngle,
    torsoAngle: rep.torsoAngle,
    contractionPassed: rep.contractionPassed,
    hingePassed: rep.hingePassed,
  }));
  const totalReps = reps.length;
  const contractionPassed = reps.filter((rep) => rep.contractionPassed);
  const hingePassed = reps.filter((rep) => rep.hingePassed);
  const fullyPassed = reps.filter((rep) => rep.contractionPassed && rep.hingePassed);
  const average = (values: number[]) => values.length > 0
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
  const evaluationNotes: string[] = [];

  if (totalReps === 0) {
    evaluationNotes.push("Inga hantelrodd registrerades under testet.");
  } else {
    evaluationNotes.push(`${totalReps} tvåarmsrepetitioner registrerades.`);
    evaluationNotes.push(
      `${contractionPassed.length}/${totalReps} nådde full dragposition och ${hingePassed.length}/${totalReps} behöll framåtfällningen.`,
    );
  }
  if (state.rejectedFrameCount > 0) {
    evaluationNotes.push(
      `${state.rejectedFrameCount} osäkra bildrutor ignorerades vid ${state.trackingLossEvents} spårningsavbrott.`,
    );
  }

  return {
    exercise: "bent-over-row",
    testVersion: "1.2-stable-rearm",
    testedAt,
    totalReps,
    currentLeftElbowAngle: state.leftElbowAngle,
    currentRightElbowAngle: state.rightElbowAngle,
    currentTorsoAngle: state.torsoAngle,
    reps,
    summary: {
      averageDurationSeconds: totalReps > 0
        ? Math.round((reps.reduce((sum, rep) => sum + rep.durationSeconds, 0) / totalReps) * 10) / 10
        : 0,
      averageContractionAngle: average(
        reps.map((rep) => Math.max(rep.minLeftElbowAngle, rep.minRightElbowAngle)),
      ),
      averageTorsoAngle: average(reps.map((rep) => rep.torsoAngle)),
      contractionSuccessRatePercent: totalReps > 0
        ? Math.round((contractionPassed.length / totalReps) * 100)
        : 0,
      hingeSuccessRatePercent: totalReps > 0
        ? Math.round((hingePassed.length / totalReps) * 100)
        : 0,
      passedRepsCount: fullyPassed.length,
    },
    trajectorySampleCount: state.trajectorySamples.length,
    trajectorySamples: state.trajectorySamples,
    trackingDiagnostics: {
      status: state.trackingStatus,
      ready: state.hasEstablishedBottom,
      armedForNextRep: state.isArmedForNextRep,
      rejectedFrameCount: state.rejectedFrameCount,
      trackingLossEvents: state.trackingLossEvents,
      lastIssue: state.trackingIssue ?? null,
      rejectedFrameReasons: state.rejectedFrameReasons,
    },
    guidance: {
      cameraAngle: "Rakt framifrån rekommenderas; högst 20° snett så att båda armarna förblir synliga",
      recommendedDistance: "1.8–2.2 meter med axlar, armar, höfter och knän synliga",
      targetContractionAngle: "Repetitionen följer den tydligaste armen vid <= 110°; den andra armen ska samtidigt stödja rörelsen",
      targetExtensionAngle: "Båda armarna raka vid kalibrering; därefter tydlig återgång mot bottenläget",
      torsoCue: "Fäll i höften med mjuka knän och behåll ryggen stilla",
    },
    evaluationNotes,
  };
}
