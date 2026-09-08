import type { SquatRepSummary } from "./motion-squat";
import {
  createWorkoutCoachDisciplineState,
  formatSwedishRepWord,
  type WorkoutCoachDisciplineState,
  type WorkoutSessionReport,
  type WorkoutSessionState,
  type WorkoutSetSummary,
} from "./motion-workout";

export type CoachTone = "calm" | "motivational" | "analytical";
export type CoachVerbosity = "minimal" | "normal" | "talkative";

export interface CoachSettings {
  tone: CoachTone;
  verbosity: CoachVerbosity;
  quietDuringSet: boolean;
  enableRestReflection?: boolean;
}

export const DEFAULT_COACH_SETTINGS: CoachSettings = {
  tone: "calm",
  verbosity: "normal",
  quietDuringSet: false,
  enableRestReflection: true,
};

export interface CoachRepSpeechCue {
  text: string;
  displayCue: string;
  isMilestone: boolean;
  nextDiscipline: WorkoutCoachDisciplineState;
}

/**
 * Formats a spoken cue for rep counting and technique feedback according to
 * the selected Coach persona tone (calm, motivational, analytical) and verbosity settings.
 *
 * @param repNumber - Current rep number.
 * @param targetReps - Target reps in the set.
 * @param settings - Current coach settings (tone, verbosity, silence during set).
 * @param lastRep - Summary of the rep just finished.
 * @param discipline - State tracking praise anti-duplication and cooldowns.
 * @returns Formatted speech cue with updated discipline state.
 */
export function formatCoachRepCue(
  repNumber: number,
  targetReps: number,
  settings: CoachSettings = DEFAULT_COACH_SETTINGS,
  lastRep?: SquatRepSummary | null,
  discipline: WorkoutCoachDisciplineState = createWorkoutCoachDisciplineState(),
): CoachRepSpeechCue {
  const word = formatSwedishRepWord(repNumber);

  // If user requested silence during the active set, only speak the rep count number
  if (settings.quietDuringSet || settings.verbosity === "minimal") {
    return {
      text: word,
      displayCue: word,
      isMilestone: false,
      nextDiscipline: discipline,
    };
  }

  const isHalf = lastRep?.classification === "half";
  const cooldownPassed = repNumber - discipline.lastAdviceRepNumber >= 3;

  // 1. Final rep of the set
  if (repNumber >= targetReps) {
    let suffix = "Set klart!";
    if (settings.tone === "calm") suffix = "Lugnt och fint. Set klart.";
    if (settings.tone === "motivational") suffix = "Kanonbra! Där satt det! Set klart!";
    if (settings.tone === "analytical") suffix = "Målreps uppnådda. Set slutfört.";

    return {
      text: `${word}! ${suffix}`,
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
    let cueText = "Sista nu!";
    if (settings.tone === "calm") cueText = "Sista nu. Andas lugnt.";
    if (settings.tone === "motivational") cueText = "Sista nu! Allt du har!";
    if (settings.tone === "analytical") cueText = "Sista repetitionen. Fullfölj rörelsebanan.";

    return {
      text: `${word}. ${cueText}`,
      displayCue: `${word} · Sista nu!`,
      isMilestone: true,
      nextDiscipline: {
        ...discipline,
        lastAdviceCategory: "milestone",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: cueText,
      },
    };
  }

  // 3. Halfway through the set
  if (repNumber === Math.floor(targetReps / 2)) {
    let halfText = "Halvvägs!";
    if (settings.tone === "calm") halfText = "Halvvägs. Mjuk och jämn takt.";
    if (settings.tone === "motivational") halfText = "Halvvägs! Grymt bra fart!";
    if (settings.tone === "analytical") halfText = "Halvvägs. 50 procent av volymen avklarad.";

    return {
      text: `${word}. ${halfText}`,
      displayCue: `${word} · Halvvägs!`,
      isMilestone: false,
      nextDiscipline: {
        ...discipline,
        lastAdviceCategory: "milestone",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: halfText,
      },
    };
  }

  // 4. Technique correction: Half-rep depth deficiency
  if (isHalf && cooldownPassed) {
    let depthAdvice = "Lite djupare nästa.";
    if (settings.tone === "calm") depthAdvice = "Sjunk ned mjukt, lite djupare nästa.";
    if (settings.tone === "motivational") depthAdvice = "Våga gå djupare nästa rep! Du fixar det!";
    if (settings.tone === "analytical") depthAdvice = `ROM var ${lastRep?.romPercent ?? 0} procent. Öka djupet mot 90 grader.`;

    return {
      text: `${word}. ${depthAdvice}`,
      displayCue: `${word} (halv) · Djupare nästa!`,
      isMilestone: false,
      nextDiscipline: {
        ...discipline,
        lastAdviceCategory: "depth",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: depthAdvice,
      },
    };
  }

  // 5. Positive reinforcement: Full ROM depth
  if (
    !discipline.praisedDepthInSet &&
    (repNumber === 2 || repNumber === 3) &&
    (lastRep?.romPercent ?? 0) >= 115 &&
    cooldownPassed
  ) {
    let praiseText = "Fint djup!";
    if (settings.tone === "calm") praiseText = "Fint djup, behåll lugnet.";
    if (settings.tone === "motivational") praiseText = "Grymt starkt djup! Fortsätt så!";
    if (settings.tone === "analytical") praiseText = `Utmärkt ROM på ${lastRep?.romPercent}% och bottenvinkel ${Math.round(lastRep?.minimumKneeAngle ?? 85)} grader.`;

    return {
      text: `${word}. ${praiseText}`,
      displayCue: `${word} · Fint djup!`,
      isMilestone: false,
      nextDiscipline: {
        ...discipline,
        praisedDepthInSet: true,
        lastAdviceCategory: "depth",
        lastAdviceRepNumber: repNumber,
        lastAdviceText: praiseText,
      },
    };
  }

  // Default clean number
  return {
    text: word,
    displayCue: word,
    isMilestone: false,
    nextDiscipline: discipline,
  };
}

/**
 * Formats a spoken cue when a workout set is completed, customized for the persona tone.
 *
 * @param setNumber - 1-based set number.
 * @param completedReps - Number of completed reps.
 * @param restSeconds - Rest duration in seconds.
 * @param primaryObservation - Technique observation derived from set metrics.
 * @param settings - Coach persona and verbosity settings.
 * @returns Spoken Swedish string for audio synthesis.
 */
export function formatCoachSetCompleteCue(
  setNumber: number,
  completedReps: number,
  restSeconds: number,
  primaryObservation: string,
  settings: CoachSettings = DEFAULT_COACH_SETTINGS,
): string {
  const cleanObs = primaryObservation.trim();

  if (settings.tone === "calm") {
    return `Set ${setNumber} klart. ${completedReps} repetitioner avklarade. ${cleanObs} Andas lugnt, ${restSeconds} sekunders vila startar nu.`;
  }

  if (settings.tone === "motivational") {
    return `Grymt jobbat! Set ${setNumber} i hamn med ${completedReps} repetitioner! ${cleanObs} Ladda om, vi vilar ${restSeconds} sekunder!`;
  }

  // analytical
  return `Set ${setNumber} registrerat. ${completedReps} repetitioner loggade. Analys: ${cleanObs} Vilotimer startad på ${restSeconds} sekunder.`;
}

export interface CoachSafetyCheckResult {
  safe: boolean;
  sanitizedText: string;
  flagReason?: string;
}

const MEDICAL_DIAGNOSTIC_KEYWORDS: readonly string[] = [
  "löparknä",
  "meniskskada",
  "diskbråck",
  "inflammation",
  "patellofemoral",
  "artros",
  "tendinit",
  "ruptur",
  "hälsporre",
  "ledskada",
  "fraktur",
];

const PAIN_KEYWORDS: readonly string[] = [
  "smärta",
  "ont",
  "huggande",
  "skarp smärta",
  "strålar",
  "domningar",
];

const MEDICAL_DISCLAIMER_SWEDISH =
  "Om du känner smärta eller obehag: avbryt övningen omedelbart. Vid ihållande besvär bör du rådfråga sjukvården.";

/**
 * Validates generated or processed coach prompts against medical diagnostic
 * and injury safety policies. Replaces risky advice with standard safety disclaimer.
 *
 * @param text - Candidate prompt text.
 * @returns Safety status and sanitized message.
 */
export function validateCoachSafetyPrompt(text: string): CoachSafetyCheckResult {
  const lower = text.toLowerCase();

  for (const keyword of MEDICAL_DIAGNOSTIC_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        safe: false,
        sanitizedText: MEDICAL_DISCLAIMER_SWEDISH,
        flagReason: `medical-diagnosis: ${keyword}`,
      };
    }
  }

  for (const keyword of PAIN_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        safe: false,
        sanitizedText: MEDICAL_DISCLAIMER_SWEDISH,
        flagReason: `pain-reported: ${keyword}`,
      };
    }
  }

  return {
    safe: true,
    sanitizedText: text,
  };
}

export interface JarvisMotionPayload {
  version: 1;
  kind: "jarvis-motion-payload";
  createdAt: string;
  coachSettings: CoachSettings;
  metrics: {
    status: string;
    targetSets: number;
    targetRepsPerSet: number;
    totalSetsCompleted: number;
    totalRepsCompleted: number;
    averageRomPercent: number;
    averageSymmetryScore?: number;
  };
  sets: readonly {
    setNumber: number;
    completedReps: number;
    fullReps: number;
    halfReps: number;
    averageRomPercent: number;
    tempoNotation?: string;
    symmetryScore?: number;
    rpe?: string;
    primaryObservation: string;
  }[];
}

/**
 * Builds a structured, privacy-sanitized payload of the motion workout session
 * suitable for LLM / Jarvis grounding without transmitting raw video or landmarks.
 *
 * @param session - Current workout session state.
 * @param settings - Configured coach settings.
 * @returns Structured JSON payload.
 */
export function buildJarvisMotionPayload(
  session: WorkoutSessionState,
  settings: CoachSettings = DEFAULT_COACH_SETTINGS,
): JarvisMotionPayload {
  const totalSets = session.completedSets.length;
  const totalReps = session.completedSets.reduce((acc, s) => acc + s.completedReps, 0);
  const avgRom =
    totalSets > 0
      ? Math.round(session.completedSets.reduce((acc, s) => acc + s.averageRomPercent, 0) / totalSets)
      : 0;

  const setsWithSym = session.completedSets.filter((s) => s.averageSymmetryScore !== undefined);
  const avgSym =
    setsWithSym.length > 0
      ? Math.round(setsWithSym.reduce((acc, s) => acc + (s.averageSymmetryScore ?? 100), 0) / setsWithSym.length)
      : undefined;

  return {
    version: 1,
    kind: "jarvis-motion-payload",
    createdAt: new Date().toISOString(),
    coachSettings: settings,
    metrics: {
      status: session.status,
      targetSets: session.config.targetSets,
      targetRepsPerSet: session.config.targetRepsPerSet,
      totalSetsCompleted: totalSets,
      totalRepsCompleted: totalReps,
      averageRomPercent: avgRom,
      averageSymmetryScore: avgSym,
    },
    sets: session.completedSets.map((s) => ({
      setNumber: s.setNumber,
      completedReps: s.completedReps,
      fullReps: s.fullReps,
      halfReps: s.halfReps,
      averageRomPercent: s.averageRomPercent,
      tempoNotation: s.averageTempoNotation,
      symmetryScore: s.averageSymmetryScore,
      rpe: s.rpe,
      primaryObservation: s.primaryObservation,
    })),
  };
}

/**
 * Generates an opt-in rest reflection question for the user during a rest period between sets.
 * Returns null if disabled in settings or if remaining rest time is too brief (< 10 seconds).
 *
 * @param setNumber - 1-based set number just completed.
 * @param restSecondsRemaining - Number of rest seconds remaining.
 * @param settings - Current coach settings.
 * @returns Reflection question in Swedish, or null if inactive.
 */
export function getRestReflectionPrompt(
  setNumber: number,
  restSecondsRemaining: number,
  settings: CoachSettings = DEFAULT_COACH_SETTINGS,
): string | null {
  if (settings.enableRestReflection === false) {
    return null;
  }
  if (restSecondsRemaining < 10) {
    return null;
  }

  if (settings.tone === "calm") {
    return `Hur kändes set ${setNumber} i kroppen? Andas lugnt och återhämta dig.`;
  }
  if (settings.tone === "motivational") {
    return `Hur kändes set ${setNumber}? Fortfarande full med energi inför nästa?`;
  }
  // analytical
  return `Set ${setNumber} avklarat. Hur skattar du muskelkontakten och ansträngningen?`;
}

export interface MotionPersonalRecords {
  maxRepsInSet: number;
  maxSessionVolume: number;
  bestAverageRomPercent: number;
  bestSymmetryScore?: number;
}

export interface MotionSessionRecord {
  sessionId: string;
  date: string;
  totalSets: number;
  totalReps: number;
  averageRomPercent: number;
  averageSymmetryScore?: number;
  rpeAverage?: string;
  dominantObservation?: string;
}

export interface MotionCoachMemory {
  version: 1;
  personalRecords: MotionPersonalRecords;
  recentSessions: readonly MotionSessionRecord[];
  patterns: {
    diveTendencyDetected: boolean;
    asymmetryDetected: boolean;
  };
}

/**
 * Creates an empty, pristine coach memory structure.
 *
 * @returns Initial MotionCoachMemory object.
 */
export function createDefaultCoachMemory(): MotionCoachMemory {
  return {
    version: 1,
    personalRecords: {
      maxRepsInSet: 0,
      maxSessionVolume: 0,
      bestAverageRomPercent: 0,
    },
    recentSessions: [],
    patterns: {
      diveTendencyDetected: false,
      asymmetryDetected: false,
    },
  };
}

export interface CoachMemoryUpdateResult {
  updatedMemory: MotionCoachMemory;
  newPersonalRecords: readonly string[];
}

/**
 * Updates the coach's long-term memory with a completed workout session,
 * detecting personal records (PRs) and tracking recent patterns across sessions.
 *
 * @param memory - Prior coach memory.
 * @param report - Completed workout session report.
 * @returns Updated coach memory and an array of any newly broken personal records.
 */
export function updateCoachMemoryWithSession(
  memory: MotionCoachMemory,
  report: WorkoutSessionReport,
): CoachMemoryUpdateResult {
  const prs: string[] = [];
  const prevPrs = memory.personalRecords;

  // 1. Max reps in set
  const sessionMaxRepsInSet = report.sets.reduce((max, s) => Math.max(max, s.completedReps), 0);
  let newMaxRepsInSet = prevPrs.maxRepsInSet;
  if (sessionMaxRepsInSet > prevPrs.maxRepsInSet && sessionMaxRepsInSet > 0) {
    prs.push(`Nytt rekord: ${sessionMaxRepsInSet} reps i ett set!`);
    newMaxRepsInSet = sessionMaxRepsInSet;
  }

  // 2. Max session volume
  let newMaxVolume = prevPrs.maxSessionVolume;
  if (report.totalRepsCompleted > prevPrs.maxSessionVolume && report.totalRepsCompleted > 0) {
    prs.push(`Nytt volymrekord: ${report.totalRepsCompleted} reps i ett pass!`);
    newMaxVolume = report.totalRepsCompleted;
  }

  // 3. Best average ROM percent (requires at least 5 reps in workout to prevent 1-rep fluke)
  let newBestRom = prevPrs.bestAverageRomPercent;
  if (report.averageRomPercent > prevPrs.bestAverageRomPercent && report.totalRepsCompleted >= 5) {
    prs.push(`Nytt ROM-rekord: ${report.averageRomPercent}% genomsnittligt djup!`);
    newBestRom = report.averageRomPercent;
  }

  // 4. Best symmetry score
  let newBestSymmetry = prevPrs.bestSymmetryScore;
  if (
    report.averageSymmetryScore !== undefined &&
    report.averageSymmetryScore > (prevPrs.bestSymmetryScore ?? 0) &&
    report.totalRepsCompleted >= 5
  ) {
    prs.push(`Nytt symmetrirekord: ${report.averageSymmetryScore}% balans!`);
    newBestSymmetry = report.averageSymmetryScore;
  }

  // Session record
  const newSessionRecord: MotionSessionRecord = {
    sessionId: `session-${report.createdAt}`,
    date: report.createdAt,
    totalSets: report.totalSetsCompleted,
    totalReps: report.totalRepsCompleted,
    averageRomPercent: report.averageRomPercent,
    averageSymmetryScore: report.averageSymmetryScore,
    dominantObservation: report.sets[0]?.primaryObservation,
  };

  const updatedRecentSessions = [newSessionRecord, ...memory.recentSessions].slice(0, 10);

  // Pattern detection across sessions
  const diveCount = report.sets.filter((s) => s.primaryObservation.includes("dyk")).length;
  const asymCount = report.sets.filter((s) => s.primaryObservation.includes("asymmetri") || s.primaryObservation.includes("obalans")).length;

  const updatedMemory: MotionCoachMemory = {
    version: 1,
    personalRecords: {
      maxRepsInSet: newMaxRepsInSet,
      maxSessionVolume: newMaxVolume,
      bestAverageRomPercent: newBestRom,
      bestSymmetryScore: newBestSymmetry,
    },
    recentSessions: updatedRecentSessions,
    patterns: {
      diveTendencyDetected: diveCount >= 1 || memory.patterns.diveTendencyDetected,
      asymmetryDetected: asymCount >= 1 || memory.patterns.asymmetryDetected,
    },
  };

  return {
    updatedMemory,
    newPersonalRecords: prs,
  };
}

export interface GroundedCoachAdviceResult {
  advice: string;
  groundedInMetrics: readonly string[];
  isHallucinationFree: boolean;
}

export interface GroundedClaimsValidationResult {
  isValid: boolean;
  contradictions: readonly string[];
}

/**
 * Generates technical coaching advice strictly grounded in the metrics of the current set,
 * guaranteeing zero hallucinated claims, angles, or rep counts.
 *
 * @param currentSet - Summary of the completed set.
 * @param context - Optional context with previous set, coach memory, and persona settings.
 * @returns Grounded advice and array of cited facts.
 */
export function generateGroundedCoachAdvice(
  currentSet: WorkoutSetSummary,
  context?: {
    previousSet?: WorkoutSetSummary;
    memory?: MotionCoachMemory;
    settings?: CoachSettings;
  },
): GroundedCoachAdviceResult {
  const settings = context?.settings ?? DEFAULT_COACH_SETTINGS;
  const groundedFacts: string[] = [
    `reps: ${currentSet.completedReps}/${currentSet.targetReps}`,
    `rom: ${currentSet.averageRomPercent}%`,
  ];
  if (currentSet.averageTempoNotation) {
    groundedFacts.push(`tempo: ${currentSet.averageTempoNotation}`);
  }
  if (currentSet.averageSymmetryScore !== undefined) {
    groundedFacts.push(`symmetri: ${currentSet.averageSymmetryScore}%`);
  }

  let text = "";

  // Depth evaluation
  if (currentSet.averageRomPercent < 85 || currentSet.halfReps > currentSet.fullReps) {
    if (settings.tone === "calm") {
      text = `Du genomförde ${currentSet.completedReps} repetitioner, men djupet nådde ${currentSet.averageRomPercent}%. Sikta på att sjunka djupare i nästa set.`;
    } else if (settings.tone === "motivational") {
      text = `Bra kämpat med ${currentSet.completedReps} reps! ROM landade på ${currentSet.averageRomPercent}%, så ladda för att våga gå djupare nästa set!`;
    } else {
      text = `Setet slutfört med ${currentSet.completedReps} reps och genomsnittlig ROM på ${currentSet.averageRomPercent}%. För optimal aktivering rekommenderas att öka djupet.`;
    }
  } else {
    // Solid or deep ROM
    if (settings.tone === "calm") {
      text = `Stadigt set med ${currentSet.completedReps} repetitioner och godkänt djup på ${currentSet.averageRomPercent}%.`;
    } else if (settings.tone === "motivational") {
      text = `Klockrent genomfört! ${currentSet.completedReps} repetitioner med stark ROM på ${currentSet.averageRomPercent}%!`;
    } else {
      text = `Set registrerat: ${currentSet.completedReps} repetitioner, genomsnittlig ROM ${currentSet.averageRomPercent}%.`;
    }
  }

  return {
    advice: text,
    groundedInMetrics: groundedFacts,
    isHallucinationFree: true,
  };
}

/**
 * Validates external or generated claims against the factual metrics of a set,
 * flagging any hallucinated or contradictory statements regarding depth, reps, or tempo.
 *
 * @param claimText - The text statement to evaluate.
 * @param currentSet - The factual ground truth metrics of the set.
 * @returns Validation outcome with specific contradiction reasons if detected.
 */
export function validateGroundedCoachClaims(
  claimText: string,
  currentSet: WorkoutSetSummary,
): GroundedClaimsValidationResult {
  const contradictions: string[] = [];
  const lower = claimText.toLowerCase();

  // 1. Depth contradictions
  const claimsExcellentDepth =
    lower.includes("perfekt djup") ||
    lower.includes("utmärkt djup") ||
    lower.includes("fullt djup") ||
    lower.includes("fantastiskt och utmärkt djup");

  if (claimsExcellentDepth && currentSet.averageRomPercent < 85) {
    contradictions.push(`Påstår utmärkt djup trots låg ROM (${currentSet.averageRomPercent}%)`);
  }

  const claimsPoorDepth =
    lower.includes("bristande djup") ||
    lower.includes("för grunt") ||
    lower.includes("otillräckligt djup");

  if (claimsPoorDepth && currentSet.averageRomPercent >= 115 && currentSet.halfReps === 0) {
    contradictions.push(`Påstår otillräckligt djup trots utmärkt ROM (${currentSet.averageRomPercent}%)`);
  }

  // 2. Rep count contradictions
  const repMatch = claimText.match(/(\d+)\s*(reps?|repetition(?:er)?)/i);
  if (repMatch) {
    const claimedNumber = parseInt(repMatch[1], 10);
    if (claimedNumber !== currentSet.completedReps) {
      contradictions.push(`Påstår felaktigt repantal i setet: angav ${claimedNumber} men utfallet var ${currentSet.completedReps}`);
    }
  }

  return {
    isValid: contradictions.length === 0,
    contradictions,
  };
}

export type WorkoutGoal = "hypertrophy" | "strength" | "endurance" | "mobility";

export interface ProposedWorkoutPlan {
  targetSets: number;
  targetRepsPerSet: number;
  restDurationSeconds: number;
  focusCue: string;
  rationale: string;
}

/**
 * Proposes a bounded, data-driven workout plan for the upcoming session based on
 * the user's logged performance history, patterns, and stated training goal.
 *
 * @param memory - Prior workout coach memory containing session logs and patterns.
 * @param goal - Stated fitness goal (hypertrophy, strength, endurance, mobility).
 * @param currentConfig - Optional baseline config (defaults to 3x10 with 45s rest).
 * @returns Proposed workout plan with target sets, target reps, rest time, and rationale.
 */
export function proposeNextWorkoutPlan(
  memory: MotionCoachMemory,
  goal: WorkoutGoal = "hypertrophy",
  currentConfig: { targetSets: number; targetRepsPerSet: number; restDurationSeconds: number } = {
    targetSets: 3,
    targetRepsPerSet: 10,
    restDurationSeconds: 45,
  },
): ProposedWorkoutPlan {
  let targetSets = currentConfig.targetSets;
  let targetReps = currentConfig.targetRepsPerSet;
  let restSeconds = currentConfig.restDurationSeconds;
  let focusCue = "Fokusera på ren teknik och fullt rörelseomfång.";
  let rationale = "Standardbaserat pass för jämn progression.";

  const latestSession = memory.recentSessions[0];

  // Pattern checks: if dive bombs were detected, hold reps and slow down
  if (memory.patterns.diveTendencyDetected) {
    focusCue = "Kontrollera tempot i nedvägen – bromsa mjukt i 2–3 sekunder.";
    rationale = "Tidigare set visade tendens till dykande tempo. Vi behåller volymen och prioriterar muskelkontroll.";
    return {
      targetSets,
      targetRepsPerSet: Math.min(targetReps, 10),
      restDurationSeconds: Math.max(restSeconds, 45),
      focusCue,
      rationale,
    };
  }

  // If asymmetry was detected, focus on balance
  if (memory.patterns.asymmetryDetected) {
    focusCue = "Tänk på att fördela vikten helt jämnt mellan höger och vänster fot.";
    rationale = "Tidigare lyft visade viss sidoskillnad. Vi bibehåller reps för att stabilisera balansen.";
    return {
      targetSets,
      targetRepsPerSet: targetReps,
      restDurationSeconds: restSeconds,
      focusCue,
      rationale,
    };
  }

  if (latestSession) {
    const isCleanDepth = latestSession.averageRomPercent >= 100;
    const isHighVolume = latestSession.totalReps >= 30;

    if (isCleanDepth && isHighVolume) {
      if (goal === "hypertrophy" || goal === "endurance") {
        targetReps = Math.min(targetReps + 1, 15);
        focusCue = `Öka till ${targetReps} reps per set med bibehållen djupkontroll.`;
        rationale = `Senaste passet visade god teknik och framsteg (${latestSession.averageRomPercent}% snitt-ROM). Vi ökar progressivt med +1 rep.`;
      } else if (goal === "strength") {
        targetReps = Math.max(targetReps - 1, 5);
        restSeconds = Math.min(restSeconds + 15, 90);
        focusCue = "Fokusera på explosiv vändning i bottenläget.";
        rationale = "Styrkefokus: vi ökar vilotiden och intensifierar varje enskild repetition.";
      }
    } else if (latestSession.averageRomPercent < 85) {
      targetReps = Math.max(targetReps - 1, 6);
      focusCue = "Prioritera djupet framför antal reps – sikta på att låren bryter parallell.";
      rationale = `Snitt-ROM var ${latestSession.averageRomPercent}%. Vi minskar reps något för att säkra godkänd rörelsebana.`;
    }
  }

  return {
    targetSets,
    targetRepsPerSet: targetReps,
    restDurationSeconds: restSeconds,
    focusCue,
    rationale,
  };
}

export interface WeeklyCoachReflection {
  totalWorkouts: number;
  totalVolumeReps: number;
  averageRomPercent: number;
  trend: "improving" | "stable" | "needs-focus";
  primaryProgress: string;
  primaryBottleneck: string;
  nextWeekFocus: string;
  isGrounded: boolean;
}

/**
 * Generates a concise weekly reflection grounded strictly in logged session history,
 * summarizing overall progress, identifying potential bottlenecks, and setting the next focus.
 *
 * @param memory - Prior workout coach memory containing session logs.
 * @param timeframeDays - Window of days to evaluate (default 7).
 * @returns Grounded weekly reflection summary.
 */
export function generateWeeklyCoachReflection(
  memory: MotionCoachMemory,
  timeframeDays: number = 7,
): WeeklyCoachReflection {
  const cutoffTime = Date.now() - timeframeDays * 24 * 60 * 60 * 1000;
  const sessionsInWindow = memory.recentSessions.filter((s) => {
    const sessionTime = new Date(s.date).getTime();
    return sessionTime >= cutoffTime;
  });

  if (sessionsInWindow.length === 0) {
    return {
      totalWorkouts: 0,
      totalVolumeReps: 0,
      averageRomPercent: 0,
      trend: "stable",
      primaryProgress: "Inga pass genomförda under den senaste veckan.",
      primaryBottleneck: "Träningen har inte startat ännu.",
      nextWeekFocus: "Genomför ditt första 3×10 knäböjspass i lugnt tempo.",
      isGrounded: true,
    };
  }

  const totalWorkouts = sessionsInWindow.length;
  const totalVolumeReps = sessionsInWindow.reduce((acc, s) => acc + s.totalReps, 0);
  const averageRomPercent = Math.round(
    sessionsInWindow.reduce((acc, s) => acc + s.averageRomPercent, 0) / totalWorkouts,
  );

  let trend: "improving" | "stable" | "needs-focus" = "stable";
  if (averageRomPercent >= 100 && totalWorkouts >= 2) {
    trend = "improving";
  } else if (averageRomPercent < 85 || memory.patterns.diveTendencyDetected) {
    trend = "needs-focus";
  }

  let primaryProgress = `Du genomförde ${totalWorkouts} pass med totalt ${totalVolumeReps} reps!`;
  if (averageRomPercent >= 100) {
    primaryProgress += ` Utmärkt genomsnittligt djup på ${averageRomPercent}%.`;
  }

  let primaryBottleneck = "Ingen tydlig flaskhals identifierad – rörelsen ser stabil ut.";
  if (memory.patterns.diveTendencyDetected) {
    primaryBottleneck = "Nervägen går ibland för fort, vilket minskar muskelspänningen i botten.";
  } else if (averageRomPercent < 90) {
    primaryBottleneck = `Genomsnittlig ROM stannar på ${averageRomPercent}%, vilket indikerar att bottenläget kan fördjupas.`;
  } else if (memory.patterns.asymmetryDetected) {
    primaryBottleneck = "Viss asymmetrisk viktfördelning mellan benen har noterats under seten.";
  }

  let nextWeekFocus = "Fortsätt i samma jämna takt och behåll kontrollen i varje repetition.";
  if (memory.patterns.diveTendencyDetected) {
    nextWeekFocus = "Fokusera på ett kontrollerat 3-sekunders tempo på nervägen.";
  } else if (averageRomPercent < 90) {
    nextWeekFocus = "Satsa på att sätta fullt djup (90 grader i knäleden) på de första 5 repetitionerna i varje set.";
  } else if (trend === "improving") {
    nextWeekFocus = "Öka med 1 rep per set för att fortsätta bygga styrka och uthållighet.";
  }

  return {
    totalWorkouts,
    totalVolumeReps,
    averageRomPercent,
    trend,
    primaryProgress,
    primaryBottleneck,
    nextWeekFocus,
    isGrounded: true,
  };
}
