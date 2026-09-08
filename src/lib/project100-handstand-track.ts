/**
 * Handstand Skill Track (Färdighetsspår: Lär dig stå på händer)
 * 10-stegs progression enligt forskning och beprövad gymnastikmetodik
 * dokumenterad i PLAN_TRANINGSUPPLEVELSE.md (Avsnitt 8).
 */

export interface HandstandProgressionStep {
  step: number;
  title: string;
  phase: "grund" | "vagg" | "balans";
  phaseName: string;
  summary: string;
  goal: string;
  exerciseName: string;
  defaultSets: number;
  defaultRepsOrSeconds: string;
  unit: "sekunder" | "reps";
  cues: string[];
  cameraSupport: string;
  motionExerciseId?: "plank" | "pike-pushup" | "handstand-hold";
}

export const HANDSTAND_PROGRESSION_STEPS: HandstandProgressionStep[] = [
  // Fas 1: Grundstyrka, leder och båltryck (På golvet)
  {
    step: 1,
    title: "Handledspreparering & Rörlighet",
    phase: "grund",
    phaseName: "Fas 1: Golv, leder & båltryck",
    summary: "Vänj lederna och senorna vid 90° extension under kontrollerad kroppsviktsbelastning.",
    goal: "60 s i fyrfota med 70 % kroppsvikt framåtlutad utan obehag.",
    exerciseName: "Handledspreparering i fyrfota",
    defaultSets: 2,
    defaultRepsOrSeconds: "60",
    unit: "sekunder",
    cues: [
      "Sprid fingrarna brett och greppa mattan med fingertopparna",
      "Gunga mjukt framåt över handlederna med raka armbågar",
      "Rotera händerna utåt och bakåt för att stretcha underarmarna",
    ],
    cameraSupport: "Tidtagning med guidat rörlighetsprotokoll.",
  },
  {
    step: 2,
    title: "Planka & Hollow Body",
    phase: "grund",
    phaseName: "Fas 1: Golv, leder & båltryck",
    summary: "Koppla på djup bål och motverka svankrygg genom posterior bäckenkippning och skulderpress.",
    goal: "45 s Hollow Body Hold + 60 s strikt planka med neutral ryggrad.",
    exerciseName: "Hollow Body Hold",
    defaultSets: 3,
    defaultRepsOrSeconds: "45",
    unit: "sekunder",
    cues: [
      "Pressa ländryggen stenhårt mot golvet",
      "Lyft skuldrorna och sträck armarna rakt bakåt",
      "Peka med tårna och håll ihop benen utan att tappa ländryggen",
    ],
    cameraSupport: "Linjemätning och båltryck via befintlig planka-tracker.",
    motionExerciseId: "plank",
  },
  {
    step: 3,
    title: "Pik-ställning med upphöjda fötter",
    phase: "grund",
    phaseName: "Fas 1: Golv, leder & båltryck",
    summary: "Träna 90° vinkel mellan överkropp och ben med fötterna upphöjda på stol, soffa eller bänk.",
    goal: "3 set × 30 s med fullt sträckta armbågar och höften rakt över axlarna.",
    exerciseName: "Pik-ställning mot stol/bänk (Box Pike Hold)",
    defaultSets: 3,
    defaultRepsOrSeconds: "30",
    unit: "sekunder",
    cues: [
      "Placera fötterna på bänken och gå händerna bakåt mot bänken",
      "Skjut upp höften rakt över axlarna så att ryggen blir lodrät",
      "Pressa golvet ifrån dig – aktiva axlar upp mot öronen",
    ],
    cameraSupport: "Vinkelanalys mellan bål och lår i sidovy.",
  },
  {
    step: 4,
    title: "Pik-armhävningar",
    phase: "grund",
    phaseName: "Fas 1: Golv, leder & båltryck",
    summary: "Bygg specifik vertikal press- och skulderstyrka för att orka bära hela kroppsvikten.",
    goal: "3 set × 8 kontrollerade repetitioner med näsan framför fingertopparna.",
    exerciseName: "Pik-armhävningar (Pike Push-Ups)",
    defaultSets: 3,
    defaultRepsOrSeconds: "8",
    unit: "reps",
    cues: [
      "Forma en triangel: huvudet sänks framför händerna, inte rakt emellan",
      "Håll armbågarna vinklade 45° inåt, sprid dem inte utåt",
      "Pressa hela vägen upp till full skulderelevation i toppen",
    ],
    cameraSupport: "Repräkning och bottenvinkel via Motion Lab pike-pushup-tracker.",
    motionExerciseId: "pike-pushup",
  },

  // Fas 2: Väggen – Raka linjer och rädslans upplösning
  {
    step: 5,
    title: "Väggklättring (Wall Walk)",
    phase: "vagg",
    phaseName: "Fas 2: Väggen & trygghet",
    summary: "Klättra med fötterna bakåt upp längs väggen till 45° lutning under full bålkontroll.",
    goal: "3 kontrollerade klättringar upp och ner utan att tappa formen.",
    exerciseName: "Väggklättring mot 45° (Wall Walk)",
    defaultSets: 3,
    defaultRepsOrSeconds: "3",
    unit: "reps",
    cues: [
      "Börja i en armhävningsposition med fötterna vid väggen",
      "Ta små kontrollerade steg uppåt samtidigt som händerna backar",
      "Stanna vid 45° lutning och behåll stark hollow body-spänning",
    ],
    cameraSupport: "Lutningsvinkel och stegvis höjdindikator.",
  },
  {
    step: 6,
    title: "Buken mot vägg (Chest-to-Wall Hold)",
    phase: "vagg",
    phaseName: "Fas 2: Väggen & trygghet",
    summary: "Guldstandarden för en spikrak handståendelinje utan bananrygg.",
    goal: "3 set × 30 s rak, obruten hålltid med näsan och tårna lätt mot väggen.",
    exerciseName: "Handstående buken mot vägg (Chest-to-Wall)",
    defaultSets: 3,
    defaultRepsOrSeconds: "30",
    unit: "sekunder",
    cues: [
      "Klättra hela vägen in så att bröstkorg och lår touchar väggen lätt",
      "Blicka mot händerna med ögonen utan att bryta nacken bakåt",
      "Pressa aktivt mot taket – gör dig så lång som möjligt",
    ],
    cameraSupport: "Inverterad kroppsanalys och röstcues vid 10, 20 och 30 s.",
    motionExerciseId: "handstand-hold",
  },
  {
    step: 7,
    title: "Säker nergång – Piruetten (The Bail-Out)",
    phase: "vagg",
    phaseName: "Fas 2: Väggen & trygghet",
    summary: "Lär kroppen att säkert och automatiskt kliva ur handståendet i sidled om du tappar balansen.",
    goal: "5 godkända piruett-avstigningar åt båda håll utan tvekan eller rädsla.",
    exerciseName: "Piruett-avstigning i sidled (Bail-Out)",
    defaultSets: 2,
    defaultRepsOrSeconds: "5",
    unit: "reps",
    cues: [
      "Om du faller: flytta en hand framåt/utåt och vrid höften åt samma håll",
      "Låt fötterna landa mjukt på golvet bredvid kroppen som en halvhjulning",
      "Öva detta medvetet från väggen så att rädslan för att falla försvinner helt",
    ],
    cameraSupport: "Rörelseanalys av sidovridning och kontrollerad fotlandning.",
  },

  // Fas 3: Balans, fingertoppskänsla och fritt svävande
  {
    step: 8,
    title: "Tå-släpp mot vägg (Wall Float / Toe Taps)",
    phase: "balans",
    phaseName: "Fas 3: Balans & fritt handstående",
    summary: "Pressa med fingertopparna för att lyfta tårna från väggen några centimeter och finna balanspunkten.",
    goal: "Hålla 5–10 s fritt svävande balans utan väggstöd per repetition.",
    exerciseName: "Tå-släpp mot vägg (Wall Float)",
    defaultSets: 4,
    defaultRepsOrSeconds: "10",
    unit: "sekunder",
    cues: [
      "Stå mot väggen (magen mot vägg) och böj lätt i ena knät",
      "Kupa fingrarna och grip tag i golvet med fingerblommorna",
      "Känn hur trycket i fingrarna drar tårna bort från väggen till fritt svävande",
    ],
    cameraSupport: "Automatisk tidtagning av den fria svävtiden utan väggkontakt.",
    motionExerciseId: "handstand-hold",
  },
  {
    step: 9,
    title: "Kontrollerad uppspark (Kick-Up Control)",
    phase: "balans",
    phaseName: "Fas 3: Balans & fritt handstående",
    summary: "Mjuk uppspark med ryggen mot vägg så att fötterna fjäderlätt möter väggen utan krasch.",
    goal: "8 av 10 uppsparkar direkt i balanslinjen utan studs eller överslag.",
    exerciseName: "Kontrollerad uppspark mot vägg (Kick-Up)",
    defaultSets: 3,
    defaultRepsOrSeconds: "6",
    unit: "reps",
    cues: [
      "Börja i ett djupt utfall med händerna i golvet ca 15–20 cm från väggen",
      "Sparka mjukt med ledarbenet medan stödjebenet följer efter kontrollerat",
      "Spänn bålen i samma sekund som benen möts i toppen",
    ],
    cameraSupport: "Hastighets- och accelerationsbedömning vid väggkontakt.",
    motionExerciseId: "handstand-hold",
  },
  {
    step: 10,
    title: "Fritt handstående & Fingertoppsbroms",
    phase: "balans",
    phaseName: "Fas 3: Balans & fritt handstående",
    summary: "Fullständigt fritt handstående ute på golvet med aktiv fingerbroms och lugn andning.",
    goal: "10–15 s fritt handstående i rak linje med mjuk kontrollerad nergång.",
    exerciseName: "Fritt handstående (Freestanding Handstand)",
    defaultSets: 5,
    defaultRepsOrSeconds: "15",
    unit: "sekunder",
    cues: [
      "Aktiva fingrar ('finger camber'): pressa fingertopparna om du tippar över, hälarna om du faller tillbaka",
      "Andas lugnt och blicka mellan tummarna",
      "Sträck tårna mot taket och lås knäna i en obruten linje",
    ],
    cameraSupport: "Live balanstimer, vertikal lodmätare och milstolpesignal vid 10 s.",
    motionExerciseId: "handstand-hold",
  },
];

export function getHandstandStep(stepNumber: number): HandstandProgressionStep {
  const step = HANDSTAND_PROGRESSION_STEPS.find((item) => item.step === stepNumber);
  if (!step) {
    return HANDSTAND_PROGRESSION_STEPS[0];
  }
  return step;
}

export interface HandstandWorkoutExerciseDraft {
  id: string;
  name: string;
  notes: string;
  isHoldDuration?: boolean;
  sets: {
    id: string;
    reps: string;
    weightKg: string;
    durationMinutes: string;
    durationSeconds?: string;
    distanceKm: string;
    rpe: string;
  }[];
}

/**
 * Skapar ett rekommenderat övningspass för handstående utifrån användarens nuvarande steg.
 * Inkluderar alltid uppvärmning/preparering och stegspecifik träning.
 */
export function buildHandstandWorkout(currentStep = 1): {
  title: string;
  summary: string;
  estimatedMinutes: number;
  exercises: HandstandWorkoutExerciseDraft[];
  stepDetails: HandstandProgressionStep;
} {
  const primaryStep = getHandstandStep(currentStep);
  const isIntroPhase = primaryStep.phase === "grund";

  const exercises: HandstandWorkoutExerciseDraft[] = [];

  // 1. Alltid handledspreparering som första övning om steget är > 1
  if (primaryStep.step > 1) {
    const prepStep = HANDSTAND_PROGRESSION_STEPS[0];
    exercises.push({
      id: crypto.randomUUID(),
      name: prepStep.exerciseName,
      notes: `${prepStep.cues[0]}. ${prepStep.cues[1]}.`,
      isHoldDuration: true,
      sets: Array.from({ length: 2 }).map(() => ({
        id: crypto.randomUUID(),
        reps: "60",
        weightKg: "",
        durationMinutes: "",
        durationSeconds: "60",
        distanceKm: "",
        rpe: "5",
      })),
    });
  }

  // 2. Primär övning för det aktuella steget
  const isSeconds = primaryStep.unit === "sekunder";
  exercises.push({
    id: crypto.randomUUID(),
    name: primaryStep.exerciseName,
    notes: `${primaryStep.summary} Mål: ${primaryStep.goal}`,
    isHoldDuration: isSeconds,
    sets: Array.from({ length: primaryStep.defaultSets }).map(() => ({
      id: crypto.randomUUID(),
      reps: primaryStep.defaultRepsOrSeconds,
      weightKg: "",
      durationMinutes: "",
      durationSeconds: isSeconds ? primaryStep.defaultRepsOrSeconds : "",
      distanceKm: "",
      rpe: "7",
    })),
  });

  // 3. Kompletterande bål / axelkontroll om det är ett kortare pass
  if (primaryStep.step >= 3 && primaryStep.step <= 7) {
    const coreStep = HANDSTAND_PROGRESSION_STEPS[1]; // Hollow Body
    exercises.push({
      id: crypto.randomUUID(),
      name: coreStep.exerciseName,
      notes: "Bibehåll stark bålspänning och neutral rygg.",
      isHoldDuration: true,
      sets: Array.from({ length: 2 }).map(() => ({
        id: crypto.randomUUID(),
        reps: "45",
        weightKg: "",
        durationMinutes: "",
        durationSeconds: "45",
        distanceKm: "",
        rpe: "7",
      })),
    });
  }

  const estimatedMinutes = isIntroPhase ? 15 : 20;

  return {
    title: `Handstående · Steg ${primaryStep.step}: ${primaryStep.title}`,
    summary: `${primaryStep.phaseName} · Mål: ${primaryStep.goal}`,
    estimatedMinutes,
    exercises,
    stepDetails: primaryStep,
  };
}
