import type { SquatRepSummary, SquatTrackerState } from "./motion-squat";

export type WorkoutStatus = "idle" | "active-set" | "resting" | "completed";

export interface WorkoutSetSummary {
  setNumber: number;
  targetReps: number;
  completedReps: number;
  halfReps: number;
  fullReps: number;
  durationMs: number;
  averageRomPercent: number;
  averageTempoNotation?: string;
  averageSymmetryScore?: number;
  primaryObservation: string;
  startedAtMs: number;
  completedAtMs: number;
  repsList: readonly SquatRepSummary[];
  restDurationMs?: number;
  rpe?: "easy" | "moderate" | "hard";
}

export interface WorkoutSessionConfig {
  targetSets: number;
  targetRepsPerSet: number;
  restDurationSeconds: number | readonly number[];
}

export interface WorkoutSessionState {
  config: WorkoutSessionConfig;
  status: WorkoutStatus;
  currentSetIndex: number;
  currentSetStartedAtMs: number | null;
  restStartedAtMs: number | null;
  warnedRestCountdown?: boolean;
  completedSets: readonly WorkoutSetSummary[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkoutSessionCue {
  text: string;
  priority: boolean;
  sound?: "set-complete" | "workout-complete" | "rest-end" | "rest-warning" | "rep";
}

export interface WorkoutSessionReport {
  version: 2;
  kind: "motion-workout-report";
  protocol: "workout-step-31";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  config: WorkoutSessionConfig;
  totalSetsCompleted: number;
  totalRepsCompleted: number;
  totalVolumeReps: number;
  averageRomPercent: number;
  averageSymmetryScore?: number;
  sets: readonly WorkoutSetSummary[];
  workoutPassed: boolean;
}

export interface WorkoutCoachDisciplineState {
  lastAdviceCategory: "depth" | "tempo" | "symmetry" | "tracking" | "milestone" | null;
  lastAdviceRepNumber: number;
  praisedDepthInSet: boolean;
  praisedTempoInSet: boolean;
  lastAdviceText: string | null;
}

export function createWorkoutCoachDisciplineState(): WorkoutCoachDisciplineState {
  return {
    lastAdviceCategory: null,
    lastAdviceRepNumber: -99,
    praisedDepthInSet: false,
    praisedTempoInSet: false,
    lastAdviceText: null,
  };
}

export interface WorkoutRepSpeechCue {
  text: string;
  displayCue: string;
  isMilestone: boolean;
  nextDiscipline: WorkoutCoachDisciplineState;
}

export const SWEDISH_REP_WORDS: readonly string[] = [
  "Noll", "Ett", "Två", "Tre", "Fyra", "Fem", "Sex", "Sju", "Åtta", "Nio", "Tio",
  "Elva", "Tolv", "Tretton", "Fjorton", "Femton", "Sexton", "Sjutton", "Arton", "Nitton", "Tjugo",
  "Tjugoett", "Tjugotvå", "Tjugotre", "Tjugofyra", "Tjugofem", "Tjugosex", "Tjugosju", "Tjugoåtta", "Tjugonio", "Trettio",
];

export function formatSwedishRepWord(repNumber: number): string {
  if (repNumber >= 0 && repNumber < SWEDISH_REP_WORDS.length) {
    return SWEDISH_REP_WORDS[repNumber];
  }
  return String(repNumber);
}

/**
 * Deterministic spoken rep counting and agile coaching prompts for Steg 33, 34 & 35.
 * Enforces strict coaching discipline:
 * - Rep count is always articulated cleanly first.
 * - Anti-duplication: Never repeats identical praise/advice back-to-back.
 * - Max 1 praise per category per set (e.g. at most one "Fint djup" in a set).
 * - Cooldown: Minimum 3 reps between technical corrections so user is never spammed.
 * - Milestones (halfway, 2 left, final rep) are sacred and never clobbered with technical advice.
 */
export function getWorkoutRepSpeechCue(
  repNumber: number,
  targetReps: number,
  lastRep?: SquatRepSummary | null,
  discipline: WorkoutCoachDisciplineState = createWorkoutCoachDisciplineState(),
): WorkoutRepSpeechCue {
  const word = formatSwedishRepWord(repNumber);
  const isHalf = lastRep?.classification === "half";
  const cooldownPassed = (repNumber - discipline.lastAdviceRepNumber >= 3);

  // 1. Final rep of the set
  if (repNumber >= targetReps) {
    return {
      text: `${word}!`,
      displayCue: `${word}! Set klart!`,
      isMilestone: true,
      nextDiscipline: {
        ...discipline,
        lastAdviceCategory: "milestone",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: `${word}!`,
      },
    };
  }

  // 2. 1 rep remaining
  if (targetReps - repNumber === 1) {
    return {
      text: `${word}. Sista nu!`,
      displayCue: `${word} · Sista nu!`,
      isMilestone: true,
      nextDiscipline: {
        ...discipline,
        lastAdviceCategory: "milestone",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: "Sista nu!",
      },
    };
  }

  // 3. 2 reps remaining
  if (targetReps - repNumber === 2) {
    return {
      text: `${word}. Två kvar!`,
      displayCue: `${word} · Två kvar!`,
      isMilestone: false,
      nextDiscipline: {
        ...discipline,
        lastAdviceCategory: "milestone",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: "Två kvar!",
      },
    };
  }

  // 4. Halfway through the set
  if (repNumber === Math.floor(targetReps / 2)) {
    return {
      text: `${word}. Halvvägs!`,
      displayCue: `${word} · Halvvägs!`,
      isMilestone: false,
      nextDiscipline: {
        ...discipline,
        lastAdviceCategory: "milestone",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: "Halvvägs!",
      },
    };
  }

  // 5. Half-rep correction (Steg 34: ROM / Depth check)
  if (isHalf) {
    if (cooldownPassed) {
      return {
        text: `${word}. Lite djupare nästa.`,
        displayCue: `${word} (halv) · Lite djupare nästa!`,
        isMilestone: false,
        nextDiscipline: {
          ...discipline,
          lastAdviceCategory: "depth",
          lastAdviceRepNumber: repNumber,
          lastAdviceText: "Lite djupare nästa.",
        },
      };
    }
    return {
      text: word,
      displayCue: `${word} (halv)`,
      isMilestone: false,
      nextDiscipline: discipline,
    };
  }

  // 6. Diving / uncontrolled eccentric descent (Steg 34: Tempo check)
  if (lastRep?.tempo && lastRep.tempo.eccentricMs > 0 && lastRep.tempo.eccentricMs < 250) {
    if (cooldownPassed) {
      return {
        text: `${word}. Lugnare på nervägen.`,
        displayCue: `${word} · Lugnare på nervägen!`,
        isMilestone: false,
        nextDiscipline: {
          ...discipline,
          lastAdviceCategory: "tempo",
          lastAdviceRepNumber: repNumber,
          lastAdviceText: "Lugnare på nervägen.",
        },
      };
    }
  }

  // 7. Marked lateral asymmetry (Steg 34: Symmetry check)
  if (lastRep?.symmetry && lastRep.symmetry.kneeAngleDiff >= 25) {
    if (cooldownPassed) {
      return {
        text: `${word}. Jämnt tryck på båda benen.`,
        displayCue: `${word} · Jämnt tryck på båda benen!`,
        isMilestone: false,
        nextDiscipline: {
          ...discipline,
          lastAdviceCategory: "symmetry",
          lastAdviceRepNumber: repNumber,
          lastAdviceText: "Jämnt tryck på båda benen.",
        },
      };
    }
  }

  // 8. Positive reinforcement - Depth (Steg 35: Max ONCE per set, never back-to-back)
  if (
    !discipline.praisedDepthInSet &&
    (repNumber === 2 || repNumber === 3) &&
    (lastRep?.romPercent ?? 0) >= 115 &&
    cooldownPassed
  ) {
    return {
      text: `${word}. Fint djup!`,
      displayCue: `${word} · Fint djup!`,
      isMilestone: false,
      nextDiscipline: {
        ...discipline,
        praisedDepthInSet: true,
        lastAdviceCategory: "depth",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: "Fint djup!",
      },
    };
  }

  // 9. Positive reinforcement - Controlled tempo (Steg 35: Max ONCE per set)
  if (
    !discipline.praisedTempoInSet &&
    (repNumber === 3 || repNumber === 4) &&
    (lastRep?.tempo?.eccentricMs ?? 0) >= 1500 &&
    cooldownPassed
  ) {
    return {
      text: `${word}. Bra kontroll!`,
      displayCue: `${word} · Bra kontroll!`,
      isMilestone: false,
      nextDiscipline: {
        ...discipline,
        praisedTempoInSet: true,
        lastAdviceCategory: "tempo",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: "Bra kontroll!",
      },
    };
  }

  // Default clean count
  return {
    text: word,
    displayCue: word,
    isMilestone: false,
    nextDiscipline: discipline,
  };
}

export const DEFAULT_WORKOUT_CONFIG: WorkoutSessionConfig = {
  targetSets: 3,
  targetRepsPerSet: 10,
  restDurationSeconds: 45,
};

export function getRestDurationForSet(config: WorkoutSessionConfig, setIndex: number): number {
  if (Array.isArray(config.restDurationSeconds)) {
    if (config.restDurationSeconds.length === 0) return 45;
    const index = Math.min(setIndex, config.restDurationSeconds.length - 1);
    return config.restDurationSeconds[index];
  }
  return typeof config.restDurationSeconds === "number" ? config.restDurationSeconds : 45;
}

export function createWorkoutSession(config?: Partial<WorkoutSessionConfig>): WorkoutSessionState {
  return {
    config: {
      ...DEFAULT_WORKOUT_CONFIG,
      ...config,
    },
    status: "idle",
    currentSetIndex: 0,
    currentSetStartedAtMs: null,
    restStartedAtMs: null,
    warnedRestCountdown: false,
    completedSets: [],
    startedAt: null,
    completedAt: null,
  };
}

export function startWorkoutSession(session: WorkoutSessionState, timestampMs: number): WorkoutSessionState {
  return {
    ...session,
    status: "active-set",
    currentSetIndex: 0,
    currentSetStartedAtMs: timestampMs,
    restStartedAtMs: null,
    warnedRestCountdown: false,
    completedSets: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

export function getRestSecondsRemaining(session: WorkoutSessionState, timestampMs: number): number {
  if (session.status !== "resting" || session.restStartedAtMs === null) return 0;
  const targetDuration = getRestDurationForSet(session.config, session.currentSetIndex);
  const elapsedSeconds = Math.floor((timestampMs - session.restStartedAtMs) / 1000);
  return Math.max(0, targetDuration - elapsedSeconds);
}

export function skipWorkoutRest(session: WorkoutSessionState, timestampMs: number): WorkoutSessionState {
  if (session.status !== "resting") return session;
  const restDurationMs = session.restStartedAtMs !== null ? Math.max(0, timestampMs - session.restStartedAtMs) : undefined;
  const updatedSets = session.completedSets.map((s, idx) =>
    idx === session.completedSets.length - 1 ? { ...s, restDurationMs } : s
  );
  const nextSetIndex = session.currentSetIndex + 1;
  if (nextSetIndex >= session.config.targetSets) {
    return {
      ...session,
      status: "completed",
      completedAt: new Date().toISOString(),
      restStartedAtMs: null,
      warnedRestCountdown: false,
      completedSets: updatedSets,
    };
  }
  return {
    ...session,
    status: "active-set",
    currentSetIndex: nextSetIndex,
    currentSetStartedAtMs: timestampMs,
    restStartedAtMs: null,
    warnedRestCountdown: false,
    completedSets: updatedSets,
  };
}

export function advanceWorkoutSession(
  session: WorkoutSessionState,
  squatTracker: SquatTrackerState,
  timestampMs: number,
): { session: WorkoutSessionState; cue?: WorkoutSessionCue; shouldResetSquatTracker: boolean } {
  // 1. Resting phase: check if rest timer has expired
  if (session.status === "resting") {
    const remaining = getRestSecondsRemaining(session, timestampMs);
    const nextSetIndex = session.currentSetIndex + 1;

    // 5-second preparation warning cue
    if (remaining <= 5 && remaining > 0 && !session.warnedRestCountdown) {
      return {
        session: {
          ...session,
          warnedRestCountdown: true,
        },
        cue: {
          text: `Fem sekunder kvar. Gör dig redo för set ${nextSetIndex + 1}.`,
          priority: true,
          sound: "rest-warning",
        },
        shouldResetSquatTracker: false,
      };
    }

    if (remaining <= 0) {
      const restDurationMs = session.restStartedAtMs !== null ? Math.max(0, timestampMs - session.restStartedAtMs) : undefined;
      const updatedSets = session.completedSets.map((s, idx) =>
        idx === session.completedSets.length - 1 ? { ...s, restDurationMs } : s
      );

      if (nextSetIndex >= session.config.targetSets) {
        return {
          session: {
            ...session,
            status: "completed",
            completedAt: new Date().toISOString(),
            restStartedAtMs: null,
            warnedRestCountdown: false,
            completedSets: updatedSets,
          },
          cue: {
            text: "Träningspasset är slutfört! Alla set avklarade.",
            priority: true,
            sound: "workout-complete",
          },
          shouldResetSquatTracker: true,
        };
      }
      return {
        session: {
          ...session,
          status: "active-set",
          currentSetIndex: nextSetIndex,
          currentSetStartedAtMs: timestampMs,
          restStartedAtMs: null,
          warnedRestCountdown: false,
          completedSets: updatedSets,
        },
        cue: {
          text: `Vilan är slut! Gör dig redo för set ${nextSetIndex + 1}.`,
          priority: true,
          sound: "rest-end",
        },
        shouldResetSquatTracker: true,
      };
    }
    return { session, shouldResetSquatTracker: false };
  }

  // 2. Active set: check if target reps reached
  if (session.status === "active-set") {
    if (squatTracker.reps >= session.config.targetRepsPerSet) {
      const startedAtMs = session.currentSetStartedAtMs ?? timestampMs;
      const durationMs = Math.max(0, timestampMs - startedAtMs);
      const setNumber = session.currentSetIndex + 1;

      // Extract set metrics
      const repsList = squatTracker.repsHistory;
      const averageRomPercent = repsList.length > 0
        ? Math.round(repsList.reduce((acc, r) => acc + r.romPercent, 0) / repsList.length)
        : squatTracker.currentRomPercent;

      const repsWithTempo = repsList.filter((r) => Boolean(r.tempo));
      const averageTempoNotation = repsWithTempo.length > 0
        ? repsWithTempo[Math.floor(repsWithTempo.length / 2)].tempo?.notation
        : undefined;

      const repsWithSymmetry = repsList.filter((r) => Boolean(r.symmetry));
      const averageSymmetryScore = repsWithSymmetry.length > 0
        ? Math.round(repsWithSymmetry.reduce((acc, r) => acc + (r.symmetry?.symmetryScore ?? 100), 0) / repsWithSymmetry.length)
        : undefined;

      const primaryObservation = averageRomPercent >= 90
        ? "Starkt set med fullt rörelseomfång."
        : "Bra genomfört set med kontrollerad rörelse.";

      const completedSet: WorkoutSetSummary = {
        setNumber,
        targetReps: session.config.targetRepsPerSet,
        completedReps: squatTracker.reps,
        halfReps: squatTracker.halfReps,
        fullReps: squatTracker.fullReps,
        durationMs,
        averageRomPercent,
        averageTempoNotation,
        averageSymmetryScore,
        primaryObservation,
        startedAtMs,
        completedAtMs: timestampMs,
        repsList,
      };

      const completedSets = [...session.completedSets, completedSet];
      const nextSetIndex = session.currentSetIndex + 1;

      if (nextSetIndex < session.config.targetSets) {
        const restSeconds = getRestDurationForSet(session.config, session.currentSetIndex);
        return {
          session: {
            ...session,
            status: "resting",
            restStartedAtMs: timestampMs,
            warnedRestCountdown: false,
            completedSets,
          },
          cue: {
            text: `Set ${setNumber} klart! ${squatTracker.reps} repetitioner genomförda. ${restSeconds} sekunders vila startar nu.`,
            priority: true,
            sound: "set-complete",
          },
          shouldResetSquatTracker: true,
        };
      }

      // All target sets completed!
      return {
        session: {
          ...session,
          status: "completed",
          completedAt: new Date().toISOString(),
          restStartedAtMs: null,
          completedSets,
        },
        cue: {
          text: `Träningspasset är slutfört! Alla ${session.config.targetSets} set avklarade med bra teknik. Fantastiskt jobbat!`,
          priority: true,
          sound: "workout-complete",
        },
        shouldResetSquatTracker: true,
      };
    }
  }

  return { session, shouldResetSquatTracker: false };
}

export function buildWorkoutSessionReport(session: WorkoutSessionState): WorkoutSessionReport {
  const totalSetsCompleted = session.completedSets.length;
  const totalRepsCompleted = session.completedSets.reduce((acc, s) => acc + s.completedReps, 0);
  const totalVolumeReps = totalRepsCompleted;
  const averageRomPercent = totalSetsCompleted > 0
    ? Math.round(session.completedSets.reduce((acc, s) => acc + s.averageRomPercent, 0) / totalSetsCompleted)
    : 0;

  const setsWithSymmetry = session.completedSets.filter((s) => s.averageSymmetryScore !== undefined);
  const averageSymmetryScore = setsWithSymmetry.length > 0
    ? Math.round(setsWithSymmetry.reduce((acc, s) => acc + (s.averageSymmetryScore ?? 100), 0) / setsWithSymmetry.length)
    : undefined;

  return {
    version: 2,
    kind: "motion-workout-report",
    protocol: "workout-step-31",
    createdAt: new Date().toISOString(),
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    config: session.config,
    totalSetsCompleted,
    totalRepsCompleted,
    totalVolumeReps,
    averageRomPercent,
    averageSymmetryScore,
    sets: session.completedSets,
    workoutPassed: totalSetsCompleted >= session.config.targetSets && totalRepsCompleted >= (session.config.targetSets * session.config.targetRepsPerSet),
  };
}
