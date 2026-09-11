import type { CyclingRevolutionSample, CyclingTrackerState } from "./motion-cycling";

export interface CyclingTestReport {
  exercise: "cycling";
  testVersion: "1.0-calibration";
  testedAt: string;
  totalRevolutions: number;
  activeSeconds: number;
  sideFacingCamera: "left" | "right";
  currentCadenceRpm: number | null;
  averageCadenceRpm: number | null;
  maxCadenceRpm: number | null;
  currentKneeAngle: number;
  minKneeAngleObserved: number;
  maxKneeAngleObserved: number;
  kneeRangeOfMotion: number;
  revolutions: CyclingRevolutionSample[];
  stability: {
    cadenceConsistencyPercent: number;
    trackingConfidence: "excellent" | "good" | "fair" | "calibrating";
    kneeRangeAdequate: boolean;
  };
  guidance: {
    cameraAngle: "side (profil)";
    recommendedHeight: string;
    recommendedDistance: string;
    targetKneeFlexion: string;
    targetKneeExtension: string;
    cadenceZones: string;
  };
  evaluationNotes: string[];
}

/**
 * Builds a structured, reproducible JSON calibration report for the exercise bike.
 * Can be copied directly to the clipboard or downloaded as a .json file.
 */
export function buildCyclingTestReport(
  state: CyclingTrackerState,
  testedAt: string = new Date().toISOString(),
): CyclingTestReport {
  const revs = state.revolutionsHistory ?? [];
  const validRpms = revs.map((r) => r.rpm).filter((rpm) => rpm > 0);

  const averageCadenceRpm =
    validRpms.length > 0
      ? Math.round(validRpms.reduce((sum, r) => sum + r, 0) / validRpms.length)
      : state.cadenceRpm;

  const maxCadenceRpm =
    validRpms.length > 0
      ? Math.max(...validRpms)
      : state.cadenceRpm;

  const minAngle = state.minKneeAngleObserved <= 180 ? state.minKneeAngleObserved : state.lastKneeAngle;
  const maxAngle = state.maxKneeAngleObserved > 0 ? state.maxKneeAngleObserved : state.lastKneeAngle;
  const kneeRangeOfMotion = Math.max(0, Math.round(maxAngle - minAngle));
  const kneeRangeAdequate = kneeRangeOfMotion >= 30;

  // Compute cadence consistency percentage
  let cadenceConsistencyPercent = 100;
  if (validRpms.length >= 3 && averageCadenceRpm && averageCadenceRpm > 0) {
    const variance =
      validRpms.reduce((acc, rpm) => acc + Math.pow(rpm - averageCadenceRpm, 2), 0) / validRpms.length;
    const stdDev = Math.sqrt(variance);
    cadenceConsistencyPercent = Math.max(0, Math.min(100, Math.round(100 - (stdDev / averageCadenceRpm) * 100)));
  }

  // Confidence grading
  let trackingConfidence: "excellent" | "good" | "fair" | "calibrating" = "calibrating";
  if (state.revolutions >= 5 && kneeRangeAdequate) {
    trackingConfidence = "excellent";
  } else if (state.revolutions >= 2) {
    trackingConfidence = "good";
  } else if (state.revolutions >= 1) {
    trackingConfidence = "fair";
  }

  const evaluationNotes: string[] = [];
  if (state.revolutions === 0) {
    evaluationNotes.push(
      "Inga hela pedalvarv har registrerats ännu. Kontrollera att kameran ser cykeln från sidan och att benet böjs under 105° och sträcks över 135°.",
    );
  } else {
    evaluationNotes.push(
      `Registrerade ${state.revolutions} pedalvarv under ${Math.round(state.activeSeconds)} sekunder aktiv trampning.`,
    );
    if (averageCadenceRpm) {
      evaluationNotes.push(`Genomsnittlig kadens: ${averageCadenceRpm} RPM (Topp: ${maxCadenceRpm} RPM).`);
    }
    if (kneeRangeAdequate) {
      evaluationNotes.push(`Tydlig knävinkelamplitud: ${kneeRangeOfMotion}° (optimalt rörelseomfång för cykling).`);
    } else {
      evaluationNotes.push(
        `Begränsat rörelseomfång (${kneeRangeOfMotion}°). Backa kameran eller vrid den något så att hela benrörelsen syns klart.`,
      );
    }
    evaluationNotes.push(`Kameran läser av ${state.side === "left" ? "vänster ben" : "höger ben"} i profil.`);
  }

  return {
    exercise: "cycling",
    testVersion: "1.0-calibration",
    testedAt,
    totalRevolutions: state.revolutions,
    activeSeconds: Math.round(state.activeSeconds * 10) / 10,
    sideFacingCamera: state.side,
    currentCadenceRpm: state.cadenceRpm,
    averageCadenceRpm,
    maxCadenceRpm,
    currentKneeAngle: Math.round(state.lastKneeAngle),
    minKneeAngleObserved: Math.round(minAngle),
    maxKneeAngleObserved: Math.round(maxAngle),
    kneeRangeOfMotion,
    revolutions: revs,
    stability: {
      cadenceConsistencyPercent,
      trackingConfidence,
      kneeRangeAdequate,
    },
    guidance: {
      cameraAngle: "side (profil)",
      recommendedHeight: "ca 60–90 cm (i höjd med sadel/vevparti)",
      recommendedDistance: "1.8–2.5 meter från cykeln",
      targetKneeFlexion: "Böj knäet under 105° i översta trampfasen",
      targetKneeExtension: "Sträck knäet över 135° i nedersta trampfasen",
      cadenceZones: "Uppvärmning: 60–75 RPM | Normalt: 75–85 RPM | Intervall: 85–100+ RPM",
    },
    evaluationNotes,
  };
}
