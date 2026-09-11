export type CyclingResistance = "light" | "medium" | "heavy";

export type CyclingPhaseType =
  | "warmup"
  | "tempo"
  | "climb"
  | "sprint"
  | "recovery"
  | "threshold"
  | "cooldown";

export interface CyclingIntervalStep {
  id: string;
  stepNumber: number;
  totalSteps: number;
  phaseType: CyclingPhaseType;
  name: string;
  durationSeconds: number;
  resistance: CyclingResistance;
  resistanceLabel: "Lätt" | "Medel" | "Tungt / Trögt";
  resistanceAdvice: string;
  targetCadenceRpm: { min: number; max: number };
  voiceCue: string;
  startSecond: number;
  endSecond: number;
}

export interface CyclingIntervalWorkoutPlan {
  id: string;
  title: string;
  description: string;
  totalDurationSeconds: number;
  steps: CyclingIntervalStep[];
}

const RAW_STEPS: Array<{
  id: string;
  phaseType: CyclingPhaseType;
  name: string;
  durationSeconds: number;
  resistance: CyclingResistance;
  resistanceLabel: "Lätt" | "Medel" | "Tungt / Trögt";
  resistanceAdvice: string;
  targetCadenceRpm: { min: number; max: number };
  voiceCue: string;
}> = [
  {
    id: "warmup-easy",
    phaseType: "warmup",
    name: "Uppvärmning · Mjukstart",
    durationSeconds: 180,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Lätt motstånd. Trampa igång benen mjukt och hitta en avslappnad rytm.",
    targetCadenceRpm: { min: 75, max: 85 },
    voiceCue: "Välkommen till 30 minuters intervallpass på cykeln. Vi börjar med 3 minuter mjukstart på lätt motstånd. Hitta en fin och avslappnad tramptakt.",
  },
  {
    id: "warmup-tempo",
    phaseType: "warmup",
    name: "Uppvärmning · Temperaturökning",
    durationSeconds: 120,
    resistance: "medium",
    resistanceLabel: "Medel",
    resistanceAdvice: "Öka till medel motstånd och höj farten något. Förbered flås och puls.",
    targetCadenceRpm: { min: 80, max: 90 },
    voiceCue: "Öka till medel motstånd och höj kadensen något. Vi väcker kroppen inför första intervallen.",
  },
  {
    id: "tempo-1",
    phaseType: "tempo",
    name: "Intervall 1 · Tempobyggnad",
    durationSeconds: 180,
    resistance: "medium",
    resistanceLabel: "Medel",
    resistanceAdvice: "Jämnt tempoarbete. Känn trycket i pedalerna men behåll god marginal.",
    targetCadenceRpm: { min: 85, max: 95 },
    voiceCue: "Intervall ett: 3 minuter stadigt tempoarbete på medel motstånd. Håll 85 till 95 varv i minuten.",
  },
  {
    id: "recovery-1",
    phaseType: "recovery",
    name: "Aktiv återhämtning",
    durationSeconds: 60,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Släpp motståndet till lätt. Andas djupt och skaka loss benen.",
    targetCadenceRpm: { min: 70, max: 80 },
    voiceCue: "Bra jobbat! Släpp motståndet till lätt och hämta andan i en minut.",
  },
  {
    id: "climb-1",
    phaseType: "climb",
    name: "Intervall 2 · Backklättring",
    durationSeconds: 150,
    resistance: "heavy",
    resistanceLabel: "Tungt / Trögt",
    resistanceAdvice: "Vrid på tungt och trögt motstånd. Starka, tunga rundtramp i lugnare takt.",
    targetCadenceRpm: { min: 60, max: 70 },
    voiceCue: "Nu börjar backklättringen. Vrid på tungt och trögt motstånd. Tunga, starka rundtramp i 60 till 70 varv i minuten!",
  },
  {
    id: "recovery-2",
    phaseType: "recovery",
    name: "Aktiv återhämtning",
    durationSeconds: 90,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Sänk motståndet till lätt. Återhämta dig inför fartlekarna.",
    targetCadenceRpm: { min: 70, max: 80 },
    voiceCue: "Toppenklättring! Släpp till lätt motstånd och låt benen rulla ut i 90 sekunder.",
  },
  {
    id: "sprint-1",
    phaseType: "sprint",
    name: "Intervall 3 · Rusch 1 av 4",
    durationSeconds: 30,
    resistance: "medium",
    resistanceLabel: "Medel",
    resistanceAdvice: "Snabb rusch! Höj tramptakten och driv på.",
    targetCadenceRpm: { min: 95, max: 110 },
    voiceCue: "Rusch ett! Öka farten och trampa på för fullt i 30 sekunder!",
  },
  {
    id: "sprint-rec-1",
    phaseType: "recovery",
    name: "Kort återhämtning",
    durationSeconds: 30,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Lätt motstånd. Andas djupt.",
    targetCadenceRpm: { min: 65, max: 75 },
    voiceCue: "Släpp till lätt och hämta andan.",
  },
  {
    id: "sprint-2",
    phaseType: "sprint",
    name: "Intervall 3 · Rusch 2 av 4",
    durationSeconds: 30,
    resistance: "medium",
    resistanceLabel: "Medel",
    resistanceAdvice: "Andra ruschen! Håll uppe kadensen.",
    targetCadenceRpm: { min: 95, max: 110 },
    voiceCue: "Rusch två, öka tempot nu!",
  },
  {
    id: "sprint-rec-2",
    phaseType: "recovery",
    name: "Kort återhämtning",
    durationSeconds: 30,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Lätt motstånd. Hämta andan inför tredje ruschen.",
    targetCadenceRpm: { min: 65, max: 75 },
    voiceCue: "Bra, andas djupt.",
  },
  {
    id: "sprint-3",
    phaseType: "sprint",
    name: "Intervall 3 · Rusch 3 av 4",
    durationSeconds: 30,
    resistance: "heavy",
    resistanceLabel: "Tungt / Trögt",
    resistanceAdvice: "Tung rusch! Mer motstånd och full kraft.",
    targetCadenceRpm: { min: 85, max: 100 },
    voiceCue: "Rusch tre med tyngre motstånd, ge allt i 30 sekunder!",
  },
  {
    id: "sprint-rec-3",
    phaseType: "recovery",
    name: "Kort återhämtning",
    durationSeconds: 30,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Lätt motstånd. Bara en rusch kvar.",
    targetCadenceRpm: { min: 65, max: 75 },
    voiceCue: "Lätt motstånd, hämta andan.",
  },
  {
    id: "sprint-4",
    phaseType: "sprint",
    name: "Intervall 3 · Rusch 4 av 4",
    durationSeconds: 30,
    resistance: "heavy",
    resistanceLabel: "Tungt / Trögt",
    resistanceAdvice: "Sista ruschen! Töm det sista i benen!",
    targetCadenceRpm: { min: 90, max: 105 },
    voiceCue: "Fjärde och sista ruschen, ös på hela vägen till signalen!",
  },
  {
    id: "sprint-rec-4",
    phaseType: "recovery",
    name: "Kort återhämtning",
    durationSeconds: 30,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Bra jobbat! Rulla lugnt.",
    targetCadenceRpm: { min: 65, max: 75 },
    voiceCue: "Snyggt kört, rulla ut.",
  },
  {
    id: "recovery-mid",
    phaseType: "recovery",
    name: "Halvtidsvila & Vätskepaus",
    durationSeconds: 60,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Lätt motstånd. Mer än halva passet är klart! Ta en klunk vatten.",
    targetCadenceRpm: { min: 70, max: 80 },
    voiceCue: "Över halva passet är klart! Drick lite vatten och förbered dig för tröskelpyramiden.",
  },
  {
    id: "pyramid-med",
    phaseType: "threshold",
    name: "Intervall 4 · Tröskel (Steg 1)",
    durationSeconds: 120,
    resistance: "medium",
    resistanceLabel: "Medel",
    resistanceAdvice: "Stadigt medel motstånd i 2 minuter. Bygg upp syreupptaget.",
    targetCadenceRpm: { min: 85, max: 92 },
    voiceCue: "Tröskelintervall: 2 minuter på medel motstånd och bra fart. Håll en stark rytm.",
  },
  {
    id: "pyramid-heavy",
    phaseType: "threshold",
    name: "Intervall 4 · Tröskel (Steg 2)",
    durationSeconds: 90,
    resistance: "heavy",
    resistanceLabel: "Tungt / Trögt",
    resistanceAdvice: "Öka till tungt och trögt motstånd! Bit i och behåll rundtrampet.",
    targetCadenceRpm: { min: 65, max: 75 },
    voiceCue: "Steg två: Vrid upp till tungt och trögt motstånd! Bit i nu i 90 sekunder.",
  },
  {
    id: "pyramid-max",
    phaseType: "sprint",
    name: "Intervall 4 · Toppattack!",
    durationSeconds: 30,
    resistance: "heavy",
    resistanceLabel: "Tungt / Trögt",
    resistanceAdvice: "Maxinsats! Töm det sista i toppen av pyramiden!",
    targetCadenceRpm: { min: 80, max: 95 },
    voiceCue: "Toppattack! Sista 30 sekunderna i pyramiden, töm benen nu!",
  },
  {
    id: "recovery-pyramid",
    phaseType: "recovery",
    name: "Snabb återhämtning",
    durationSeconds: 60,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Släpp till lätt motstånd. Djupa andetag inför sista tempoblocket.",
    targetCadenceRpm: { min: 70, max: 80 },
    voiceCue: "Grymt krigat! Släpp till lätt motstånd och andas ut.",
  },
  {
    id: "tempo-finish",
    phaseType: "tempo",
    name: "Intervall 5 · Sista tempoblocket",
    durationSeconds: 120,
    resistance: "medium",
    resistanceLabel: "Medel",
    resistanceAdvice: "Sista hårda blocket! Håll ihop formen och rundtrampet i 2 minuter.",
    targetCadenceRpm: { min: 80, max: 90 },
    voiceCue: "Sista tempoblocket i 2 minuter. Håll ihop tekniken på medel motstånd, snart i mål!",
  },
  {
    id: "cooldown-flush",
    phaseType: "cooldown",
    name: "Nedvarvning · Skölj ur benen",
    durationSeconds: 180,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Lätt motstånd. Skölj ur mjölksyran och sänk pulsen lugnt och sansat.",
    targetCadenceRpm: { min: 65, max: 75 },
    voiceCue: "Huvuddelen är klar, fantastiskt bra kört! Nu sköljer vi ur benen med lätt motstånd i 3 minuter.",
  },
  {
    id: "cooldown-free",
    phaseType: "cooldown",
    name: "Nedvarvning · Fri utrullning",
    durationSeconds: 120,
    resistance: "light",
    resistanceLabel: "Lätt",
    resistanceAdvice: "Minimalt motstånd. Rulla lugnt och njut av ett fullföljt pass!",
    targetCadenceRpm: { min: 50, max: 65 },
    voiceCue: "Sista två minuterna. Släpp motståndet helt, rulla lugnt och njut av ett genomfört pass!",
  },
];

function buildPlan(): CyclingIntervalWorkoutPlan {
  let elapsed = 0;
  const steps: CyclingIntervalStep[] = RAW_STEPS.map((step, index) => {
    const start = elapsed;
    elapsed += step.durationSeconds;
    return {
      ...step,
      stepNumber: index + 1,
      totalSteps: RAW_STEPS.length,
      startSecond: start,
      endSecond: elapsed,
    };
  });

  return {
    id: "cycling-intervals-30",
    title: "30 min Intervallcykling",
    description: "Seriöst intervallpass på motionscykel med motståndsguidning (Lätt, Medel, Tungt), backklättring och temporyck.",
    totalDurationSeconds: elapsed,
    steps,
  };
}

export const CYCLING_INTERVAL_30_PLAN: CyclingIntervalWorkoutPlan = buildPlan();

export interface CyclingIntervalSessionState {
  plan: CyclingIntervalWorkoutPlan;
  elapsedSeconds: number;
  currentStepIndex: number;
  currentStep: CyclingIntervalStep;
  nextStep: CyclingIntervalStep | null;
  stepRemainingSeconds: number;
  progressPercent: number;
  isCompleted: boolean;
  isPaused: boolean;
  voiceCueTriggeredForStepId: string | null;
  /** Estimated calories based on 30 min intervals (~8-10 kcal/min depending on intensity) */
  estimatedCalories: number;
}

export function createCyclingIntervalSession(
  plan: CyclingIntervalWorkoutPlan = CYCLING_INTERVAL_30_PLAN,
): CyclingIntervalSessionState {
  const currentStep = plan.steps[0];
  const nextStep = plan.steps[1] ?? null;
  return {
    plan,
    elapsedSeconds: 0,
    currentStepIndex: 0,
    currentStep,
    nextStep,
    stepRemainingSeconds: currentStep.durationSeconds,
    progressPercent: 0,
    isCompleted: false,
    isPaused: false,
    voiceCueTriggeredForStepId: null,
    estimatedCalories: 0,
  };
}

export function getCyclingStepAtSecond(
  plan: CyclingIntervalWorkoutPlan,
  second: number,
): { stepIndex: number; step: CyclingIntervalStep } {
  const clamped = Math.max(0, Math.min(second, plan.totalDurationSeconds - 1));
  const index = plan.steps.findIndex((s) => clamped >= s.startSecond && clamped < s.endSecond);
  const resolvedIndex = index === -1 ? plan.steps.length - 1 : index;
  return {
    stepIndex: resolvedIndex,
    step: plan.steps[resolvedIndex],
  };
}

export function advanceCyclingIntervalSession(
  state: CyclingIntervalSessionState,
  deltaSeconds: number,
): CyclingIntervalSessionState {
  if (state.isCompleted || state.isPaused) return state;

  const nextElapsed = Math.min(
    state.plan.totalDurationSeconds,
    state.elapsedSeconds + Math.max(0, deltaSeconds),
  );

  const isCompleted = nextElapsed >= state.plan.totalDurationSeconds;
  const { stepIndex, step } = isCompleted
    ? {
        stepIndex: state.plan.steps.length - 1,
        step: state.plan.steps[state.plan.steps.length - 1],
      }
    : getCyclingStepAtSecond(state.plan, nextElapsed);

  const nextStep = state.plan.steps[stepIndex + 1] ?? null;
  const stepRemainingSeconds = isCompleted ? 0 : Math.max(0, step.endSecond - Math.floor(nextElapsed));
  const progressPercent = Math.min(100, Math.round((nextElapsed / state.plan.totalDurationSeconds) * 100));

  // Burn rate: light ~ 7 kcal/min, medium ~ 10 kcal/min, heavy ~ 13 kcal/min
  const burnRateKcalPerSec = step.resistance === "heavy" ? 13 / 60 : step.resistance === "medium" ? 10 / 60 : 7 / 60;
  const estimatedCalories = Math.round(state.estimatedCalories + (Math.max(0, deltaSeconds) * burnRateKcalPerSec));

  return {
    ...state,
    elapsedSeconds: nextElapsed,
    currentStepIndex: stepIndex,
    currentStep: step,
    nextStep,
    stepRemainingSeconds,
    progressPercent,
    isCompleted,
    estimatedCalories,
  };
}

export function skipToNextCyclingInterval(
  state: CyclingIntervalSessionState,
): CyclingIntervalSessionState {
  if (state.isCompleted) return state;
  const nextIndex = state.currentStepIndex + 1;
  if (nextIndex >= state.plan.steps.length) {
    return {
      ...state,
      elapsedSeconds: state.plan.totalDurationSeconds,
      currentStepIndex: state.plan.steps.length - 1,
      currentStep: state.plan.steps[state.plan.steps.length - 1],
      nextStep: null,
      stepRemainingSeconds: 0,
      progressPercent: 100,
      isCompleted: true,
    };
  }
  const targetStep = state.plan.steps[nextIndex];
  return {
    ...state,
    elapsedSeconds: targetStep.startSecond,
    currentStepIndex: nextIndex,
    currentStep: targetStep,
    nextStep: state.plan.steps[nextIndex + 1] ?? null,
    stepRemainingSeconds: targetStep.durationSeconds,
    progressPercent: Math.round((targetStep.startSecond / state.plan.totalDurationSeconds) * 100),
  };
}

export function formatIntervalTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function getResistanceBadgeColors(resistance: CyclingResistance): {
  bg: string;
  border: string;
  text: string;
  iconColor: string;
} {
  switch (resistance) {
    case "light":
      return {
        bg: "rgba(52, 211, 153, 0.15)",
        border: "#10b981",
        text: "#34d399",
        iconColor: "#34d399",
      };
    case "medium":
      return {
        bg: "rgba(251, 191, 36, 0.15)",
        border: "#f59e0b",
        text: "#fbbf24",
        iconColor: "#fbbf24",
      };
    case "heavy":
      return {
        bg: "rgba(239, 68, 68, 0.18)",
        border: "#ef4444",
        text: "#f87171",
        iconColor: "#ef4444",
      };
  }
}
