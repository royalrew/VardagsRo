import type { MotionLandmark } from "./motion-engine";
import { computeJointAngle3D } from "./motion-camera-coach";
import {
  createLungeTrackerState,
  advanceLungeTracker,
  createPushupTrackerState,
  advancePushupTracker,
  createPlankTrackerState,
  advancePlankTracker,
  createJumpingJackTrackerState,
  advanceJumpingJackTracker,
  type LungeTrackerState,
  type PushupTrackerState,
  type PlankTrackerState,
  type JumpingJackTrackerState,
} from "./motion-exercises";
import {
  createSquatTrackerState,
  advanceSquatTracker,
  measureSquatAngles,
  type SquatTrackerState,
} from "./motion-squat";
import {
  advanceCyclingTracker,
  createCyclingTracker,
  type CyclingTrackerState,
} from "./motion-cycling";

export const TRACKABLE_EXERCISE_IDS = [
  "squat",
  "lunge",
  "pushup",
  "jumping-jacks",
  "plank",
  "handstand-hold",
  "pike-pushup",
  "bench-dips",
  "calf-raise",
  "bulgarian-split-squat",
  "bicep-curl",
  "overhead-press",
  "lateral-raise",
  "bent-over-row",
  "dumbbell-rdl",
  "kettlebell-swing",
  "goblet-squat",
  "cycling",
] as const;

export type TrackableExerciseId = (typeof TRACKABLE_EXERCISE_IDS)[number];

export const PLANNED_EXERCISE_IDS = [
  "diamond-pushup",
  "side-plank",
  "mountain-climbers",
  "parallel-bar-dips",
  "hammer-curl",
] as const;

export type PlannedExerciseId = (typeof PLANNED_EXERCISE_IDS)[number];
export type LibraryExerciseId = TrackableExerciseId | PlannedExerciseId;

const TRACKABLE_EXERCISE_ID_SET: ReadonlySet<string> = new Set(TRACKABLE_EXERCISE_IDS);

export function isTrackableExerciseId(id: string): id is TrackableExerciseId {
  return TRACKABLE_EXERCISE_ID_SET.has(id);
}

function unsupportedExercise(exerciseId: never): never {
  throw new Error(`Övningen ${exerciseId} saknar en verifierad tracker.`);
}

export type ExerciseEquipment = "bodyweight" | "dumbbell" | "kettlebell" | "bench-or-chair" | "parallel-bars" | "bicycle";
export type MuscleGroup = "chest" | "back" | "shoulders" | "biceps" | "triceps" | "legs" | "core" | "full-body";
export type ExerciseTrackingMode = "reps" | "hold";

export interface ExerciseLibraryItem {
  id: LibraryExerciseId;
  name: string;
  category: "calisthenics" | "dumbbell" | "kettlebell" | "cardio-core";
  equipment: ExerciseEquipment;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  trackingMode: ExerciseTrackingMode;
  recommendedCameraAngle: "front" | "side" | "diagonal";
  targetRepsDefault: number;
  cues: {
    start: string;
    action: string;
    formWarning: string;
    praise: string;
  };
  description: string;
}

export const EXERCISE_LIBRARY: Record<LibraryExerciseId, ExerciseLibraryItem> = {
  // 1. Calisthenics / Bodyweight
  squat: {
    id: "squat",
    name: "Knäböj",
    category: "calisthenics",
    equipment: "bodyweight",
    primaryMuscle: "legs",
    secondaryMuscles: ["core"],
    trackingMode: "reps",
    recommendedCameraAngle: "front",
    targetRepsDefault: 12,
    cues: {
      start: "Stå axelbrett med fötterna lätt utåt.",
      action: "Böj djupt ner under parallellt läge.",
      formWarning: "Sök fullt djup med höften under knäna.",
      praise: "Perfekt djup och stark bål!",
    },
    description: "Klassisk knäböj för maximal ben- och sätesstyrka.",
  },
  cycling: {
    id: "cycling",
    name: "Spinninguppvärmning",
    category: "cardio-core",
    equipment: "bicycle",
    primaryMuscle: "legs",
    secondaryMuscles: ["core"],
    trackingMode: "hold",
    recommendedCameraAngle: "side",
    targetRepsDefault: 300,
    cues: {
      start: "Placera cykeln i profil så att höft, knä och fotled syns.",
      action: "Trampa lugnt och jämnt medan kameran följer pedalcykeln.",
      formWarning: "Kameran uppskattar bara pedalcykler, kadens och tid i den här första versionen.",
      praise: "Jämn trampning registrerad.",
    },
    description: "Kamerabaserad kontroll av lugn spinning som uppvärmning.",
  },
  lunge: {
    id: "lunge",
    name: "Utfall",
    category: "calisthenics",
    equipment: "bodyweight",
    primaryMuscle: "legs",
    secondaryMuscles: ["core"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 10,
    cues: {
      start: "Ta ett stort kliv framåt i profil.",
      action: "Sänk det bakre knät rakt mot marken.",
      formWarning: "Håll främre knät i 90 grader utan att det viker inåt.",
      praise: "Stabilt och kontrollerat utfall!",
    },
    description: "Unilateral benstyrka och balans för knä- och höftstabilitet.",
  },
  "bulgarian-split-squat": {
    id: "bulgarian-split-squat",
    name: "Bulgariska utfall",
    category: "calisthenics",
    equipment: "bench-or-chair",
    primaryMuscle: "legs",
    secondaryMuscles: ["core"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 10,
    cues: {
      start: "Placera ena foten på bänken eller stolen bakom dig.",
      action: "Böj det främre benet djupt ner mot 90 grader.",
      formWarning: "Håll överkroppen stolt och främre knät stabilt.",
      praise: "Fantastiskt djup och unilateral benkontroll!",
    },
    description: "Unilateral benövning med bakre foten upphöjd för maximal aktivering av säte och framsida lår.",
  },
  pushup: {
    id: "pushup",
    name: "Armhävningar",
    category: "calisthenics",
    equipment: "bodyweight",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders", "core"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 15,
    cues: {
      start: "Inta plankposition med händerna under axlarna.",
      action: "Sänk bröstet kontrollerat mot golvet.",
      formWarning: "Håll kroppen spänd som en rak planka.",
      praise: "Ren bröstpress och orubblig planka!",
    },
    description: "Kungen av överkroppsstyrka: bröst, triceps och bålspänning.",
  },
  "diamond-pushup": {
    id: "diamond-pushup",
    name: "Diamant-armhävningar",
    category: "calisthenics",
    equipment: "bodyweight",
    primaryMuscle: "triceps",
    secondaryMuscles: ["chest", "core"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 12,
    cues: {
      start: "Sätt händerna tätt ihop under bröstet så tummar och pekfingrar möts.",
      action: "Sänk bröstet mot händerna med armbågarna tätt intill kroppen.",
      formWarning: "Håll händerna tätt ihop och kroppen rak som en planka.",
      praise: "Stenhård tricepspress och stabil planklinje!",
    },
    description: "Tät armhävning som flyttar belastningen direkt till triceps och inre bröstmuskler.",
  },
  "jumping-jacks": {
    id: "jumping-jacks",
    name: "Jumping Jacks",
    category: "cardio-core",
    equipment: "bodyweight",
    primaryMuscle: "full-body",
    secondaryMuscles: ["legs", "shoulders"],
    trackingMode: "reps",
    recommendedCameraAngle: "front",
    targetRepsDefault: 30,
    cues: {
      start: "Stå rakt upp med armarna längs sidan.",
      action: "Hoppa isär med armarna högt över huvudet.",
      formWarning: "Sträck ut armarna ordentligt hela vägen upp.",
      praise: "Högt tempo och bra spänst!",
    },
    description: "Konditions- och spänsthöjare för hela kroppen och uppvärmning.",
  },
  plank: {
    id: "plank",
    name: "Planka",
    category: "cardio-core",
    equipment: "bodyweight",
    primaryMuscle: "core",
    secondaryMuscles: ["shoulders", "legs"],
    trackingMode: "hold",
    recommendedCameraAngle: "side",
    targetRepsDefault: 45,
    cues: {
      start: "Ställ dig på underarmarna med kroppen i en rak linje.",
      action: "Spänn magen och sätet, andas lugnt.",
      formWarning: "Håll en rak linje – lyft inte höften för högt.",
      praise: "Orubblig bålstabilitet!",
    },
    description: "Isometrisk bålstyrka och motståndskraft mot ländryggsbelastning.",
  },
  "side-plank": {
    id: "side-plank",
    name: "Sidoplanka",
    category: "cardio-core",
    equipment: "bodyweight",
    primaryMuscle: "core",
    secondaryMuscles: ["shoulders"],
    trackingMode: "hold",
    recommendedCameraAngle: "side",
    targetRepsDefault: 30,
    cues: {
      start: "Ligg på sidan stödd på ena underarmen med fötterna ihop.",
      action: "Lyft höften så kroppen bildar en spikrak diagonal linje.",
      formWarning: "Låt inte höften sjunka mot golvet!",
      praise: "Orubblig stabilitet i sidobålen!",
    },
    description: "Isometrisk stabilitet för de sneda bukmusklerna (obliques) och höftens stabilisatorer.",
  },
  "mountain-climbers": {
    id: "mountain-climbers",
    name: "Mountain Climbers",
    category: "cardio-core",
    equipment: "bodyweight",
    primaryMuscle: "core",
    secondaryMuscles: ["full-body"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 20,
    cues: {
      start: "Inta hög armhävningsposition med händerna under axlarna.",
      action: "Driv knäna växelvis framåt mot bröstet i högt tempo.",
      formWarning: "Håll höften låg och bålen stabil under löpsteget.",
      praise: "Högt tempo och explosivt knädriv!",
    },
    description: "Dynamisk helkroppsövning som kombinerar plankstyrka med pulshöjande sprintmoment.",
  },
  "handstand-hold": {
    id: "handstand-hold",
    name: "Handstående (Handstand Hold)",
    category: "calisthenics",
    equipment: "bodyweight",
    primaryMuscle: "shoulders",
    secondaryMuscles: ["core", "triceps", "back"],
    trackingMode: "hold",
    recommendedCameraAngle: "front",
    targetRepsDefault: 20,
    cues: {
      start: "Sparka upp mot en vägg eller fritt på golvet.",
      action: "Tryck ifrån genom axlarna och håll kroppen lodrät.",
      formWarning: "Pressa ifrån golvet och håll fötterna sträckta mot taket.",
      praise: "Brutal axelstyrka och perfekt linje!",
    },
    description: "Klassisk gymnastik och calisthenics för total axel- och skulderbladskontroll.",
  },
  "pike-pushup": {
    id: "pike-pushup",
    name: "Pik-armhävningar",
    category: "calisthenics",
    equipment: "bodyweight",
    primaryMuscle: "shoulders",
    secondaryMuscles: ["triceps", "chest"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 8,
    cues: {
      start: "Ställ dig i ett inverterat V med höften högt i luften.",
      action: "Sänk pannan snett framåt mot golvet.",
      formWarning: "Håll armbågarna något inåt och höften hög.",
      praise: "Stark vertikal press!",
    },
    description: "Kroppsviktsaxelpress som bygger rå skulderstyrka mot handstående armhävning.",
  },
  "bench-dips": {
    id: "bench-dips",
    name: "Bänk-dips (bakom kroppen)",
    category: "calisthenics",
    equipment: "bench-or-chair",
    primaryMuscle: "triceps",
    secondaryMuscles: ["chest", "shoulders"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 12,
    cues: {
      start: "Sätt händerna på en stol eller bänkkant bakom ryggen med fötterna i golvet.",
      action: "Sänk kroppen nära bänken till 90 graders armbågsvinkel och pressa upp.",
      formWarning: "Sänk bara så långt som känns stabilt och smärtfritt. Avbryt vid obehag i axeln.",
      praise: "Kraftfull lockout i triceps!",
    },
    description: "Klassiska dips med händerna bakom ryggen på en stol eller soffa och fötterna i golvet.",
  },
  "parallel-bar-dips": {
    id: "parallel-bar-dips",
    name: "Barr-dips (2 stänger/stolar)",
    category: "calisthenics",
    equipment: "parallel-bars",
    primaryMuscle: "triceps",
    secondaryMuscles: ["chest", "shoulders"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 10,
    cues: {
      start: "Greppa stängerna eller stolarna vid sidorna med raka armar och kroppen hängande.",
      action: "Sänk kroppen kontrollerat tills armbågarna är i 90 grader och pressa upp.",
      formWarning: "Avbryt vid axelobehag. Den här avancerade variationen aktiveras först efter särskild livevalidering.",
      praise: "Stark dip med orubblig kroppskontroll och full lockout!",
    },
    description: "Tunga dips med kroppen hängande mellan två parallella stänger eller stolar för massiv triceps- och bröststyrka.",
  },
  "calf-raise": {
    id: "calf-raise",
    name: "Tåhävningar",
    category: "calisthenics",
    equipment: "bodyweight",
    primaryMuscle: "legs",
    secondaryMuscles: [],
    trackingMode: "reps",
    recommendedCameraAngle: "front",
    targetRepsDefault: 20,
    cues: {
      start: "Stå med fötterna höftbrett.",
      action: "Tryck upp högt på tå och håll en sekund på toppen.",
      formWarning: "Sök maximal höjd utan att gunga med kroppen.",
      praise: "Hög fin topposition i vaderna!",
    },
    description: "Stärker vader, hälsenor och fotvalv för löpsteg och spänst.",
  },

  // 2. Dumbbell Exercises
  "bicep-curl": {
    id: "bicep-curl",
    name: "Hantel-bicepscurl",
    category: "dumbbell",
    equipment: "dumbbell",
    primaryMuscle: "biceps",
    secondaryMuscles: ["back"],
    trackingMode: "reps",
    recommendedCameraAngle: "front",
    targetRepsDefault: 10,
    cues: {
      start: "Håll hantlarna längs sidorna med armbågarna intill kroppen.",
      action: "Curla upp vikten mot axlarna och spänn i toppläget.",
      formWarning: "Lås armbågarna vid sidan – svinga inte med överkroppen.",
      praise: "Skarp kontraktion och kontrollerad negativ fas!",
    },
    description: "Isolerande armböjning för armstyrka och bicepsutveckling.",
  },
  "hammer-curl": {
    id: "hammer-curl",
    name: "Hammercurls",
    category: "dumbbell",
    equipment: "dumbbell",
    primaryMuscle: "biceps",
    secondaryMuscles: ["back"],
    trackingMode: "reps",
    recommendedCameraAngle: "front",
    targetRepsDefault: 12,
    cues: {
      start: "Håll hantlarna med neutralt grepp (tummarna pekande uppåt).",
      action: "Curla hantlarna uppåt utan att vrida handlederna.",
      formWarning: "Lås armbågarna vid sidorna utan att pendla.",
      praise: "Ren hammercurl med isolerad armstyrka!",
    },
    description: "Isolerar överarmsböjaren (brachialis) och underarmarna med neutralt hantelgrepp.",
  },
  "overhead-press": {
    id: "overhead-press",
    name: "Hantel-axelpress",
    category: "dumbbell",
    equipment: "dumbbell",
    primaryMuscle: "shoulders",
    secondaryMuscles: ["triceps", "core"],
    trackingMode: "reps",
    recommendedCameraAngle: "front",
    targetRepsDefault: 10,
    cues: {
      start: "Håll hantlarna vid axel- och öronhöjd.",
      action: "Pressa rakt upp över huvudet till full utlåsning.",
      formWarning: "Pressa rakt upp utan att överdriva svanken.",
      praise: "Distinkt utlåsning och stabil bål!",
    },
    description: "Grundläggande vertikal press för breda och starka axlar.",
  },
  "lateral-raise": {
    id: "lateral-raise",
    name: "Hantel-sidolyft",
    category: "dumbbell",
    equipment: "dumbbell",
    primaryMuscle: "shoulders",
    secondaryMuscles: ["back"],
    trackingMode: "reps",
    recommendedCameraAngle: "front",
    targetRepsDefault: 12,
    cues: {
      start: "Håll hantlarna vid lårens framsida med lätt böjda armbågar.",
      action: "Lyft armarna rakt åt sidan till axelhöjd.",
      formWarning: "Lyft inte över axelhöjd och gunga inte med benen.",
      praise: "Perfekt 90-graders lyft i sidoplanet!",
    },
    description: "Fokuserar på utsida axlar (laterala deltoideus) för V-form.",
  },
  "bent-over-row": {
    id: "bent-over-row",
    name: "Framåtlutad hantelrodd",
    category: "dumbbell",
    equipment: "dumbbell",
    primaryMuscle: "back",
    secondaryMuscles: ["biceps", "core"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 10,
    cues: {
      start: "Fäll fram i höften med rak rygg och armarna hängande.",
      action: "Dra armbågarna uppåt och bakåt intill bålen.",
      formWarning: "Håll ländryggen stabil och neutral.",
      praise: "Stark skulderbladsindragning!",
    },
    description: "Bygger ryggbredd, lats och hållning genom kontrollerad rodd.",
  },
  "dumbbell-rdl": {
    id: "dumbbell-rdl",
    name: "Hantelmarklyft (RDL)",
    category: "dumbbell",
    equipment: "dumbbell",
    primaryMuscle: "legs",
    secondaryMuscles: ["back", "core"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 10,
    cues: {
      start: "Stå höftbrett med hantlarna framför låren och mjuka knän.",
      action: "Skjut bak höften och låt hantlarna glida längs smalbenen.",
      formWarning: "Håll knäna fasta och ryggen rak – fäll i höften!",
      praise: "Perfekt sträckning i baksida lår och kraftfull höftuträtning!",
    },
    description: "Raka marklyft med hantlar för att bygga baksida lår (hamstrings) och säte med minimal ländryggsbelastning.",
  },

  // 3. Kettlebell Exercises
  "kettlebell-swing": {
    id: "kettlebell-swing",
    name: "Kettlebellsving",
    category: "kettlebell",
    equipment: "kettlebell",
    primaryMuscle: "legs",
    secondaryMuscles: ["back", "core", "full-body"],
    trackingMode: "reps",
    recommendedCameraAngle: "side",
    targetRepsDefault: 20,
    cues: {
      start: "Fäll bak höften med kettlebellen mellan låren.",
      action: "Snäpp fram höften explosivt så kulan flyter till brösthöjd.",
      formWarning: "Detta är en höftfällning, inte en knäböj!",
      praise: "Explosiv höftsträckning och fjäderlätt sving!",
    },
    description: "Explosiv höft- och säteskraft som kombinerar flås med funktionell bakkedjestyrka.",
  },
  "goblet-squat": {
    id: "goblet-squat",
    name: "Goblet Squat (Hantel/Kettlebell)",
    category: "kettlebell",
    equipment: "kettlebell",
    primaryMuscle: "legs",
    secondaryMuscles: ["core", "shoulders"],
    trackingMode: "reps",
    recommendedCameraAngle: "front",
    targetRepsDefault: 12,
    cues: {
      start: "Håll vikten tätt intill bröstet med båda händerna.",
      action: "Böj djupt ner med armbågarna innanför knäna.",
      formWarning: "Låt inte vikten falla framåt från bröstet.",
      praise: "Magnifikt djup med upprätt bröstkorg!",
    },
    description: "Benstyrka med vikt framtill som främjar perfekt upprätt knäböjsteknik.",
  },
};

export function getLibraryExercise(id: LibraryExerciseId): ExerciseLibraryItem {
  return EXERCISE_LIBRARY[id];
}

export function filterExercisesByEquipment(equipment: ExerciseEquipment): ExerciseLibraryItem[] {
  return Object.values(EXERCISE_LIBRARY).filter((item) => item.equipment === equipment);
}

export function filterExercisesByMuscle(muscle: MuscleGroup): ExerciseLibraryItem[] {
  return Object.values(EXERCISE_LIBRARY).filter(
    (item) => item.primaryMuscle === muscle || item.secondaryMuscles.includes(muscle),
  );
}

// ---------------------------------------------------------------------------
// 1. Dumbbell Bicep Curl Tracker
// ---------------------------------------------------------------------------

export type BicepCurlPhase = "extended" | "flexing" | "contracted";

export interface BicepCurlRepRecord {
  repNumber: number;
  arm: "left" | "right" | "both";
  minElbowAngle: number;
  extensionElbowAngle: number;
  durationMs: number;
  contractionPassed: boolean;
  swayWarning: boolean;
}

export interface BicepCurlTrajectorySample {
  timestampMs: number;
  leftElbowAngle: number;
  rightElbowAngle: number;
  leftWristToElbowY: number;
  rightWristToElbowY: number;
  shoulderWidth: number;
  phase: BicepCurlPhase;
  arm: "left" | "right" | "both";
  trackingStatus: BicepCurlTrackingStatus;
  trackingIssue?: BicepCurlTrackingIssue;
}

export type BicepCurlTrackingStatus =
  | "seeking-extension"
  | "ready"
  | "curling"
  | "tracking-lost";

export type BicepCurlTrackingIssue =
  | "landmarks-unreliable"
  | "too-close"
  | "too-far"
  | "body-moved";

export interface BicepCurlTrackerState {
  phase: BicepCurlPhase;
  reps: number;
  lastAngle: number;
  leftAngle: number;
  rightAngle: number;
  activeArm?: "left" | "right" | "both";
  currentRepArm?: "left" | "right" | "both";
  elbowSwayWarning: boolean;
  repsHistory: BicepCurlRepRecord[];
  trajectorySamples: BicepCurlTrajectorySample[];
  currentRepStartedAtMs?: number;
  currentRepMinAngle?: number;
  currentRepMaxAngle?: number;
  lastRepAtMs?: number;
  lastSampleAtMs?: number;
  hasEstablishedStartingExtension?: boolean;
  trackingStatus: BicepCurlTrackingStatus;
  trackingIssue?: BicepCurlTrackingIssue;
  rejectedFrameCount: number;
  trackingLossEvents: number;
  extensionStableSinceMs?: number;
  baselineLeftAngle?: number;
  baselineRightAngle?: number;
  baselineLeftWristToElbowY?: number;
  baselineRightWristToElbowY?: number;
  baselineShoulderWidth?: number;
  currentRepMaxWristLift?: number;
  trackingLostSinceMs?: number;
  rejectedFrameReasons: Record<BicepCurlTrackingIssue, number>;
}

export function createBicepCurlTracker(): BicepCurlTrackerState {
  return {
    phase: "extended",
    reps: 0,
    lastAngle: 155,
    leftAngle: 155,
    rightAngle: 155,
    activeArm: "both",
    currentRepArm: "both",
    elbowSwayWarning: false,
    repsHistory: [],
    trajectorySamples: [],
    hasEstablishedStartingExtension: false,
    trackingStatus: "seeking-extension",
    rejectedFrameCount: 0,
    trackingLossEvents: 0,
    rejectedFrameReasons: {
      "landmarks-unreliable": 0,
      "too-close": 0,
      "too-far": 0,
      "body-moved": 0,
    },
  };
}

const BICEP_MIN_VISIBILITY = 0.3;
const BICEP_MIN_SHOULDER_WIDTH = 0.075;
const BICEP_MAX_SHOULDER_WIDTH = 0.4;
const BICEP_START_EXTENSION_ANGLE = 130;
const BICEP_START_EXTENSION_HOLD_MS = 300;
const BICEP_CURL_START_DELTA = 12;
const BICEP_CURL_PEAK_ANGLE = 125;
const BICEP_CURL_QUALITY_ANGLE = 106;
const BICEP_MIN_REP_WRIST_LIFT_SHOULDER_RATIO = 0.75;
const BICEP_MIN_REP_DURATION_MS = 450;
const BICEP_MAX_REP_DURATION_MS = 8_000;
const BICEP_TRACKING_LOSS_GRACE_MS = 900;

function isReliableBicepLandmark(landmark: MotionLandmark | undefined): landmark is MotionLandmark {
  return Boolean(
    landmark
    && Number.isFinite(landmark.x)
    && Number.isFinite(landmark.y)
    && Number.isFinite(landmark.z)
    && landmark.x >= -0.02
    && landmark.x <= 1.02
    && landmark.y >= -0.02
    && landmark.y <= 1.02
    && (landmark.visibility ?? 1) >= BICEP_MIN_VISIBILITY,
  );
}

function rejectBicepFrame(
  state: BicepCurlTrackerState,
  issue: BicepCurlTrackingIssue,
  nowMs: number,
  allowBriefPause = false,
  forceRearm = false,
): BicepCurlTrackerState {
  const trackingLostSinceMs = state.trackingLostSinceMs ?? nowMs;
  const shared: BicepCurlTrackerState = {
    ...state,
    trackingStatus: "tracking-lost",
    trackingIssue: issue,
    rejectedFrameCount: (state.rejectedFrameCount ?? 0) + 1,
    trackingLossEvents:
      (state.trackingLossEvents ?? 0) + (state.trackingStatus === "tracking-lost" ? 0 : 1),
    trackingLostSinceMs,
    rejectedFrameReasons: {
      ...state.rejectedFrameReasons,
      [issue]: (state.rejectedFrameReasons?.[issue] ?? 0) + 1,
    },
  };
  if (forceRearm) {
    return {
      ...shared,
      phase: "extended",
      currentRepStartedAtMs: undefined,
      currentRepMinAngle: undefined,
      currentRepMaxAngle: undefined,
      currentRepMaxWristLift: undefined,
      hasEstablishedStartingExtension: false,
      extensionStableSinceMs: undefined,
      baselineLeftAngle: undefined,
      baselineRightAngle: undefined,
      baselineLeftWristToElbowY: undefined,
      baselineRightWristToElbowY: undefined,
      baselineShoulderWidth: undefined,
    };
  }
  if (allowBriefPause && state.hasEstablishedStartingExtension) {
    return shared;
  }
  return {
    ...shared,
    phase: "extended",
    currentRepStartedAtMs: undefined,
    currentRepMinAngle: undefined,
    currentRepMaxAngle: undefined,
    currentRepMaxWristLift: undefined,
    hasEstablishedStartingExtension: state.hasEstablishedStartingExtension,
  };
}

export function advanceBicepCurlTracker(
  landmarks: readonly MotionLandmark[],
  state: BicepCurlTrackerState,
  aspectRatio = 1,
  nowMs: number = Date.now(),
): BicepCurlTrackerState {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];

  const requiredLandmarks = [
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
  ];
  if (!requiredLandmarks.every(isReliableBicepLandmark)) {
    return rejectBicepFrame(state, "landmarks-unreliable", nowMs, true);
  }

  const shoulderWidth = Math.hypot(
    (leftShoulder.x - rightShoulder.x) * aspectRatio,
    leftShoulder.y - rightShoulder.y,
  );
  if (shoulderWidth > BICEP_MAX_SHOULDER_WIDTH) {
    return rejectBicepFrame(state, "too-close", nowMs, true);
  }
  if (shoulderWidth < BICEP_MIN_SHOULDER_WIDTH) {
    return rejectBicepFrame(state, "too-far", nowMs, true);
  }

  const baselineShoulderWidth = state.baselineShoulderWidth;
  const distanceChangedAfterReady = Boolean(
    state.hasEstablishedStartingExtension
    && baselineShoulderWidth
    && (
      shoulderWidth < baselineShoulderWidth * 0.72
      || shoulderWidth > baselineShoulderWidth * 1.3
    ),
  );
  if (distanceChangedAfterReady) {
    // A substantial scale change means the person moved toward or away from
    // the camera. Cancel any partial rep, then allow a fresh bottom calibration
    // at the new position instead of permanently locking to the old framing.
    return rejectBicepFrame(state, "body-moved", nowMs, false, true);
  }

  // 2. Validate anatomical elbow angle (0 to 185 deg)
  const isValidElbowAngle = (ang: number | null): ang is number =>
    ang !== null && ang >= 0 && ang <= 185;

  // Compute angles for available arms
  const rawLeftAngle = computeJointAngle3D(leftShoulder, leftElbow, leftWrist, aspectRatio);
  const rawRightAngle = computeJointAngle3D(rightShoulder, rightElbow, rightWrist, aspectRatio);

  const leftAngle = isValidElbowAngle(rawLeftAngle) ? rawLeftAngle : null;
  const rightAngle = isValidElbowAngle(rawRightAngle) ? rawRightAngle : null;

  if (leftAngle === null || rightAngle === null) {
    return rejectBicepFrame(state, "landmarks-unreliable", nowMs, true);
  }

  const effectiveLeft = leftAngle;
  const effectiveRight = rightAngle;
  const abandonStalePartialRep = Boolean(
    state.trackingLostSinceMs !== undefined
    && nowMs - state.trackingLostSinceMs >= BICEP_TRACKING_LOSS_GRACE_MS,
  );
  const previousPhase: BicepCurlPhase = abandonStalePartialRep ? "extended" : state.phase;
  const leftWristToElbowY = leftWrist.y - leftElbow.y;
  const rightWristToElbowY = rightWrist.y - rightElbow.y;
  const leftExtended = effectiveLeft >= BICEP_START_EXTENSION_ANGLE && leftWristToElbowY >= 0.04;
  const rightExtended = effectiveRight >= BICEP_START_EXTENSION_ANGLE && rightWristToElbowY >= 0.04;
  const bothExtended = leftExtended && rightExtended;

  let extensionStableSinceMs = state.extensionStableSinceMs;
  let hasEstablishedStartingExtension = state.hasEstablishedStartingExtension ?? false;
  let baselineLeftAngle = state.baselineLeftAngle;
  let baselineRightAngle = state.baselineRightAngle;
  let baselineLeftWristToElbowY = state.baselineLeftWristToElbowY;
  let baselineRightWristToElbowY = state.baselineRightWristToElbowY;
  let nextBaselineShoulderWidth = state.baselineShoulderWidth;

  if (!hasEstablishedStartingExtension) {
    if (bothExtended) {
      extensionStableSinceMs ??= nowMs;
      if (nowMs - extensionStableSinceMs >= BICEP_START_EXTENSION_HOLD_MS) {
        hasEstablishedStartingExtension = true;
        baselineLeftAngle = effectiveLeft;
        baselineRightAngle = effectiveRight;
        baselineLeftWristToElbowY = leftWristToElbowY;
        baselineRightWristToElbowY = rightWristToElbowY;
        nextBaselineShoulderWidth = shoulderWidth;
      }
    } else {
      extensionStableSinceMs = undefined;
    }
  }

  const leftDelta = (baselineLeftAngle ?? effectiveLeft) - effectiveLeft;
  const rightDelta = (baselineRightAngle ?? effectiveRight) - effectiveRight;
  // Measure the hand relative to its elbow. Unlike absolute image coordinates,
  // this remains stable when the person shifts position inside the frame.
  const leftWristLift = (baselineLeftWristToElbowY ?? leftWristToElbowY) - leftWristToElbowY;
  const rightWristLift = (baselineRightWristToElbowY ?? rightWristToElbowY) - rightWristToElbowY;
  const leftCurlCandidate =
    leftWristLift >= 0.035 && (leftDelta >= BICEP_CURL_START_DELTA || leftWristLift >= 0.07);
  const rightCurlCandidate =
    rightWristLift >= 0.035 && (rightDelta >= BICEP_CURL_START_DELTA || rightWristLift >= 0.07);

  let activeArm: "left" | "right" | "both" = state.currentRepArm ?? state.activeArm ?? "both";
  if (previousPhase === "extended") {
    if (leftCurlCandidate && rightCurlCandidate && Math.abs(leftDelta - rightDelta) <= 24) {
      activeArm = "both";
    } else if (leftCurlCandidate && (!rightCurlCandidate || leftDelta > rightDelta + 8)) {
      activeArm = "left";
    } else if (rightCurlCandidate && (!leftCurlCandidate || rightDelta > leftDelta + 8)) {
      activeArm = "right";
    }
  }

  const currentRepArmCandidate = previousPhase === "extended" ? activeArm : (state.currentRepArm ?? activeArm);
  const angle = currentRepArmCandidate === "left"
    ? effectiveLeft
    : currentRepArmCandidate === "right"
      ? effectiveRight
      : (effectiveLeft + effectiveRight) / 2;

  // Check elbow sway warning (elbow moving too far back behind shoulder)
  let elbowSway = false;
  if ((activeArm === "left" || activeArm === "both") && leftElbow && leftShoulder) {
    if (leftElbow.z !== undefined && leftShoulder.z !== undefined && leftElbow.z > leftShoulder.z + 0.22) {
      elbowSway = true;
    }
  }
  if ((activeArm === "right" || activeArm === "both") && rightElbow && rightShoulder) {
    if (rightElbow.z !== undefined && rightShoulder.z !== undefined && rightElbow.z > rightShoulder.z + 0.22) {
      elbowSway = true;
    }
  }

  let phase = previousPhase;
  let nextReps = state.reps;
  let lastRepAtMs = state.lastRepAtMs;
  let currentRepStartedAtMs = abandonStalePartialRep ? undefined : state.currentRepStartedAtMs;
  let currentRepMinAngle = abandonStalePartialRep ? angle : (state.currentRepMinAngle ?? angle);
  let currentRepMaxAngle = abandonStalePartialRep
    ? angle
    : Math.max(state.currentRepMaxAngle ?? angle, angle);
  let currentRepArm = state.currentRepArm ?? activeArm;
  const wristLiftForArm = (arm: "left" | "right" | "both") =>
    arm === "left"
      ? leftWristLift
      : arm === "right"
        ? rightWristLift
        : (leftWristLift + rightWristLift) / 2;
  let currentRepMaxWristLift = Math.max(
    abandonStalePartialRep ? 0 : (state.currentRepMaxWristLift ?? 0),
    wristLiftForArm(currentRepArm),
  );
  let repsHistory = state.repsHistory ?? [];

  if (phase === "extended") {
    currentRepMaxAngle = Math.max(currentRepMaxAngle, angle);
    if (hasEstablishedStartingExtension && (leftCurlCandidate || rightCurlCandidate)) {
      phase = "flexing";
      currentRepStartedAtMs = currentRepStartedAtMs ?? nowMs;
      currentRepMinAngle = angle;
      currentRepArm = activeArm;
      currentRepMaxWristLift = wristLiftForArm(activeArm);
    }
  } else if (phase === "flexing") {
    currentRepMinAngle = Math.min(currentRepMinAngle, angle);
    currentRepMaxAngle = Math.max(currentRepMaxAngle, angle);
    currentRepMaxWristLift = Math.max(currentRepMaxWristLift, wristLiftForArm(currentRepArm));

    const activeWristAtPeak = currentRepArm === "left"
      ? leftWristToElbowY <= -0.02
      : currentRepArm === "right"
        ? rightWristToElbowY <= -0.02
        : leftWristToElbowY <= -0.02 && rightWristToElbowY <= -0.02;
    if (angle <= BICEP_CURL_PEAK_ANGLE && activeWristAtPeak) {
      phase = "contracted";
    } else {
      const activeArmReturned = currentRepArm === "left"
        ? leftWristToElbowY >= Math.max(0.04, (baselineLeftWristToElbowY ?? 0.04) - 0.065)
        : currentRepArm === "right"
          ? rightWristToElbowY >= Math.max(0.04, (baselineRightWristToElbowY ?? 0.04) - 0.065)
          : leftWristToElbowY >= Math.max(0.04, (baselineLeftWristToElbowY ?? 0.04) - 0.065)
            && rightWristToElbowY >= Math.max(0.04, (baselineRightWristToElbowY ?? 0.04) - 0.065);
      if (activeArmReturned) {
        phase = "extended";
        currentRepStartedAtMs = undefined;
        currentRepMinAngle = angle;
        currentRepMaxAngle = angle;
        currentRepMaxWristLift = 0;
      }
    }
  } else if (phase === "contracted") {
    currentRepMinAngle = Math.min(currentRepMinAngle, angle);
    currentRepMaxAngle = Math.max(currentRepMaxAngle, angle);
    currentRepMaxWristLift = Math.max(currentRepMaxWristLift, wristLiftForArm(currentRepArm));

    const hasLoweredToBottom = currentRepArm === "left"
      ? leftWristToElbowY >= Math.max(0.04, (baselineLeftWristToElbowY ?? 0.04) - 0.065)
      : currentRepArm === "right"
        ? rightWristToElbowY >= Math.max(0.04, (baselineRightWristToElbowY ?? 0.04) - 0.065)
        : leftWristToElbowY >= Math.max(0.04, (baselineLeftWristToElbowY ?? 0.04) - 0.065)
          && rightWristToElbowY >= Math.max(0.04, (baselineRightWristToElbowY ?? 0.04) - 0.065);

    if (hasLoweredToBottom) {
      phase = "extended";
      const rawDuration = currentRepStartedAtMs ? nowMs - currentRepStartedAtMs : 1200;
      const isInstantCall = currentRepStartedAtMs !== undefined && rawDuration <= 50;
      const duration = isInstantCall ? 1200 : rawDuration;
      const timeSinceLast = lastRepAtMs ? nowMs - lastRepAtMs : Infinity;
      const wristLiftShoulderRatio = currentRepMaxWristLift / Math.max(
        nextBaselineShoulderWidth ?? shoulderWidth,
        0.001,
      );

      if (
        wristLiftShoulderRatio >= BICEP_MIN_REP_WRIST_LIFT_SHOULDER_RATIO
        && (isInstantCall || (
          duration >= BICEP_MIN_REP_DURATION_MS
          && duration <= BICEP_MAX_REP_DURATION_MS
          && timeSinceLast >= 550
        ))
      ) {
        nextReps += 1;
        lastRepAtMs = nowMs;
        repsHistory = [
          ...repsHistory,
          {
            repNumber: nextReps,
            arm: currentRepArm,
            minElbowAngle: Math.round(currentRepMinAngle),
            extensionElbowAngle: Math.round(angle),
            durationMs: duration,
            contractionPassed: currentRepMinAngle <= BICEP_CURL_QUALITY_ANGLE,
            swayWarning: elbowSway,
          },
        ];
      }
      currentRepStartedAtMs = undefined;
      currentRepMinAngle = angle;
      currentRepMaxAngle = angle;
      currentRepMaxWristLift = 0;
    }
  }

  // Record downsampled trajectory (~15 Hz)
  let trajectorySamples = state.trajectorySamples ?? [];
  const lastSampleAt = state.lastSampleAtMs ?? 0;
  let lastSampleAtMs = state.lastSampleAtMs;
  if (nowMs - lastSampleAt >= 65) {
    const newSample: BicepCurlTrajectorySample = {
      timestampMs: Math.round(nowMs),
      leftElbowAngle: Math.round(effectiveLeft),
      rightElbowAngle: Math.round(effectiveRight),
      leftWristToElbowY: Math.round(leftWristToElbowY * 1_000) / 1_000,
      rightWristToElbowY: Math.round(rightWristToElbowY * 1_000) / 1_000,
      shoulderWidth: Math.round(shoulderWidth * 1_000) / 1_000,
      phase,
      arm: activeArm,
      trackingStatus: !hasEstablishedStartingExtension
        ? "seeking-extension"
        : phase === "extended"
          ? "ready"
          : "curling",
    };
    trajectorySamples = [...trajectorySamples.slice(-299), newSample];
    lastSampleAtMs = nowMs;
  }

  return {
    ...state,
    phase,
    reps: nextReps,
    lastAngle: Math.round(angle),
    leftAngle: Math.round(effectiveLeft),
    rightAngle: Math.round(effectiveRight),
    activeArm,
    currentRepArm,
    elbowSwayWarning: elbowSway,
    repsHistory,
    trajectorySamples,
    currentRepStartedAtMs,
    currentRepMinAngle,
    currentRepMaxAngle,
    currentRepMaxWristLift,
    lastRepAtMs,
    lastSampleAtMs,
    hasEstablishedStartingExtension,
    trackingStatus: !hasEstablishedStartingExtension
      ? "seeking-extension"
      : phase === "extended"
        ? "ready"
        : "curling",
    extensionStableSinceMs,
    baselineLeftAngle,
    baselineRightAngle,
    baselineLeftWristToElbowY,
    baselineRightWristToElbowY,
    baselineShoulderWidth: nextBaselineShoulderWidth,
    trackingLostSinceMs: undefined,
  };
}

// ---------------------------------------------------------------------------
// 2. Dumbbell Overhead Shoulder Press Tracker
// ---------------------------------------------------------------------------

export type OverheadPressPhase = "rack" | "pressing" | "lockout";

export interface OverheadPressRepRecord {
  repNumber: number;
  arm: "left" | "right" | "both";
  minArmAngle: number;
  lockoutArmAngle: number;
  durationMs: number;
  lockoutPassed: boolean;
}

export interface OverheadPressTrajectorySample {
  timestampMs: number;
  armAngle: number;
  phase: OverheadPressPhase;
  arm: "left" | "right" | "both";
}

export interface OverheadPressTrackerState {
  phase: OverheadPressPhase;
  reps: number;
  lastArmAngle: number;
  activeArm?: "left" | "right" | "both";
  currentRepArm?: "left" | "right" | "both";
  repsHistory: OverheadPressRepRecord[];
  trajectorySamples: OverheadPressTrajectorySample[];
  currentRepStartedAtMs?: number;
  currentRepMinAngle?: number;
  currentRepMaxAngle?: number;
  currentRepMinWristY?: number;
  lastRepAtMs?: number;
  lastSampleAtMs?: number;
}

export function createOverheadPressTracker(): OverheadPressTrackerState {
  return {
    phase: "rack",
    reps: 0,
    lastArmAngle: 85,
    activeArm: "both",
    currentRepArm: "both",
    repsHistory: [],
    trajectorySamples: [],
  };
}

export function advanceOverheadPressTracker(
  landmarks: readonly MotionLandmark[],
  state: OverheadPressTrackerState,
  aspectRatio = 1,
  nowMs: number = Date.now(),
): OverheadPressTrackerState {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];

  if (!leftShoulder || !rightShoulder) {
    return state;
  }

  const leftAngle =
    leftElbow && leftWrist
      ? computeJointAngle3D(leftShoulder, leftElbow, leftWrist, aspectRatio)
      : null;
  const rightAngle =
    rightElbow && rightWrist
      ? computeJointAngle3D(rightShoulder, rightElbow, rightWrist, aspectRatio)
      : null;

  const nose = landmarks[0];
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  // Head level: at or above nose height (significantly above shoulders)
  const headY = nose ? Math.min(nose.y + 0.04, shoulderY - 0.06) : shoulderY - 0.10;

  // True overhead extension per arm:
  // 1. Wrist must be at or above head height (not resting at chest, chin or waist)
  // 2. Elbow must be raised above shoulder level (not resting against ribs/waist)
  const isLeftOverhead = Boolean(
    leftWrist &&
    leftWrist.y < headY &&
    leftElbow &&
    leftElbow.y < leftShoulder.y + 0.06,
  );
  const isRightOverhead = Boolean(
    rightWrist &&
    rightWrist.y < headY &&
    rightElbow &&
    rightElbow.y < rightShoulder.y + 0.06,
  );

  // Determine active pressing arm:
  // When both arms are overhead above head, it is a two-arm / kettlebell press.
  // When only one arm is overhead, it is a single-arm press.
  let activeArm: "left" | "right" | "both";
  let angle: number;
  let isOverhead: boolean;

  if (isLeftOverhead && isRightOverhead) {
    activeArm = "both";
    angle =
      leftAngle !== null && rightAngle !== null
        ? (leftAngle + rightAngle) / 2
        : (leftAngle ?? rightAngle ?? state.lastArmAngle);
    isOverhead = true;
  } else if (isLeftOverhead) {
    activeArm = "left";
    angle = leftAngle ?? state.lastArmAngle;
    isOverhead = true;
  } else if (isRightOverhead) {
    activeArm = "right";
    angle = rightAngle ?? state.lastArmAngle;
    isOverhead = true;
  } else {
    // Neither arm is overhead (resting by side or rack at chest/shoulders)
    activeArm = state.activeArm ?? "both";
    if (activeArm === "left" && leftAngle !== null) {
      angle = leftAngle;
    } else if (activeArm === "right" && rightAngle !== null) {
      angle = rightAngle;
    } else {
      angle =
        leftAngle !== null && rightAngle !== null
          ? (leftAngle + rightAngle) / 2
          : (leftAngle ?? rightAngle ?? state.lastArmAngle);
    }
    isOverhead = false;
  }

  // Active wrist height (lower y = higher up in the frame)
  const activeWristY =
    activeArm === "left"
      ? leftWrist?.y ?? 0.5
      : activeArm === "right"
      ? rightWrist?.y ?? 0.5
      : leftWrist && rightWrist
      ? (leftWrist.y + rightWrist.y) / 2
      : leftWrist?.y ?? rightWrist?.y ?? 0.5;

  let phase = state.phase;
  let nextReps = state.reps;
  let lastRepAtMs = state.lastRepAtMs;
  let currentRepStartedAtMs = state.currentRepStartedAtMs;
  let currentRepMinAngle = state.currentRepMinAngle ?? angle;
  let currentRepMaxAngle = Math.max(state.currentRepMaxAngle ?? angle, angle);
  let currentRepMinWristY = state.currentRepMinWristY;
  let currentRepArm = state.currentRepArm ?? activeArm;
  let repsHistory = state.repsHistory ?? [];

  if (phase === "rack") {
    currentRepMinAngle = Math.min(currentRepMinAngle, angle);
    if (angle <= 126) {
      currentRepStartedAtMs = nowMs;
    }

    if (angle >= 145 && isOverhead) {
      phase = "lockout";
      currentRepStartedAtMs = currentRepStartedAtMs ?? nowMs;
      currentRepMaxAngle = angle;
      currentRepMinWristY = activeWristY;
      currentRepArm = activeArm;
    } else if (angle > 115 && isOverhead) {
      phase = "pressing";
      currentRepStartedAtMs = currentRepStartedAtMs ?? nowMs;
      currentRepMaxAngle = angle;
      currentRepArm = activeArm;
    }
  } else if (phase === "pressing") {
    currentRepMinAngle = Math.min(currentRepMinAngle, angle);
    currentRepMaxAngle = Math.max(currentRepMaxAngle, angle);
    if (activeArm !== "both") {
      currentRepArm = activeArm;
    }
    if (angle <= 126) {
      currentRepStartedAtMs = nowMs;
    }

    if (angle >= 145 && isOverhead) {
      phase = "lockout";
      currentRepMinWristY = activeWristY;
    } else if (!isOverhead && angle <= 126) {
      phase = "rack";
      currentRepStartedAtMs = undefined;
      currentRepMinAngle = angle;
      currentRepMaxAngle = angle;
      currentRepMinWristY = undefined;
    }
  } else if (phase === "lockout") {
    currentRepMaxAngle = Math.max(currentRepMaxAngle, angle);
    currentRepMinWristY = Math.min(currentRepMinWristY ?? activeWristY, activeWristY);
    if (activeArm !== "both") {
      currentRepArm = activeArm;
    }

    // Returning to rack:
    // 1. In dumbbell press: user lowers weight to ear level (angle <= 125°)
    // 2. In kettlebell press: user lowers weight to chest (angle <= 115°)
    // 3. Hands actually descend from peak lockout height
    // 4. Arm must travel through at least 20°-22° ROM drop
    const romDrop = currentRepMaxAngle - angle;
    const rackLevelY = nose ? (nose.y + shoulderY) / 2 : shoulderY - 0.06;
    const wristDescended =
      activeWristY >= rackLevelY ||
      activeWristY >= (currentRepMinWristY ?? activeWristY) + 0.12;
    const hasLoweredToRack = wristDescended && angle <= 128 && romDrop >= 20;

    if (hasLoweredToRack) {
      phase = "rack";
      const rawDuration = currentRepStartedAtMs ? nowMs - currentRepStartedAtMs : 1200;
      const isInstantCall = currentRepStartedAtMs !== undefined && rawDuration <= 50;
      const duration = isInstantCall ? 1200 : rawDuration;
      const timeSinceLast = lastRepAtMs ? nowMs - lastRepAtMs : Infinity;
      if (isInstantCall || (duration >= 600 && timeSinceLast >= 700)) {
        nextReps += 1;
        lastRepAtMs = nowMs;
        repsHistory = [
          ...repsHistory,
          {
            repNumber: nextReps,
            arm: currentRepArm,
            minArmAngle: Math.round(currentRepMinAngle),
            lockoutArmAngle: Math.round(currentRepMaxAngle),
            durationMs: duration,
            lockoutPassed: currentRepMaxAngle >= 145,
          },
        ];
      }
      currentRepStartedAtMs = undefined;
      currentRepMinAngle = angle;
      currentRepMaxAngle = angle;
      currentRepMinWristY = undefined;
    }
  }

  // Record downsampled trajectory samples (~15 Hz)
  let trajectorySamples = state.trajectorySamples ?? [];
  const lastSampleAt = state.lastSampleAtMs ?? 0;
  if (nowMs - lastSampleAt >= 65) {
    const newSample: OverheadPressTrajectorySample = {
      timestampMs: Math.round(nowMs),
      armAngle: Math.round(angle),
      phase,
      arm: activeArm,
    };
    trajectorySamples = [...trajectorySamples.slice(-299), newSample];
  }

  return {
    ...state,
    phase,
    reps: nextReps,
    lastArmAngle: Math.round(angle),
    activeArm,
    currentRepArm,
    repsHistory,
    trajectorySamples,
    currentRepStartedAtMs,
    currentRepMinAngle,
    currentRepMaxAngle,
    currentRepMinWristY,
    lastRepAtMs,
    lastSampleAtMs: nowMs,
  };
}

// ---------------------------------------------------------------------------
// 3. Dumbbell Lateral Raise Tracker
// ---------------------------------------------------------------------------

export type LateralRaisePhase = "bottom" | "raising" | "peak";

export type LateralRaiseTrackingStatus =
  | "seeking-bottom"
  | "ready"
  | "raising"
  | "tracking-lost";

export type LateralRaiseTrackingIssue =
  | "landmarks-unreliable"
  | "too-close"
  | "too-far"
  | "distance-changed";

export interface LateralRaiseRepRecord {
  repNumber: number;
  arm: "left" | "right" | "both";
  peakAngle: number;
  bottomAngle: number;
  durationMs: number;
  heightPassed: boolean;
  overshootWarning: boolean;
}

export interface LateralRaiseTrajectorySample {
  timestampMs: number;
  leftAbductionAngle: number;
  rightAbductionAngle: number;
  leftWristToShoulderY: number;
  rightWristToShoulderY: number;
  shoulderWidth: number;
  phase: LateralRaisePhase;
  arm: "left" | "right" | "both";
  trackingStatus: LateralRaiseTrackingStatus;
}

export interface LateralRaiseTrackerState {
  phase: LateralRaisePhase;
  reps: number;
  lastAbductionAngle: number;
  leftAbductionAngle: number;
  rightAbductionAngle: number;
  activeArm: "left" | "right" | "both";
  currentRepArm?: "left" | "right" | "both";
  repsHistory: LateralRaiseRepRecord[];
  trajectorySamples: LateralRaiseTrajectorySample[];
  trackingStatus: LateralRaiseTrackingStatus;
  trackingIssue?: LateralRaiseTrackingIssue;
  rejectedFrameCount: number;
  trackingLossEvents: number;
  rejectedFrameReasons: Record<LateralRaiseTrackingIssue, number>;
  hasEstablishedBottom: boolean;
  bottomStableSinceMs?: number;
  baselineLeftAngle?: number;
  baselineRightAngle?: number;
  baselineLeftWristToShoulderY?: number;
  baselineRightWristToShoulderY?: number;
  baselineShoulderWidth?: number;
  currentRepStartedAtMs?: number;
  currentRepPeakAngle?: number;
  lastRepAtMs?: number;
  lastSampleAtMs?: number;
  trackingLostSinceMs?: number;
}

export function createLateralRaiseTracker(): LateralRaiseTrackerState {
  return {
    phase: "bottom",
    reps: 0,
    lastAbductionAngle: 15,
    leftAbductionAngle: 15,
    rightAbductionAngle: 15,
    activeArm: "both",
    currentRepArm: "both",
    repsHistory: [],
    trajectorySamples: [],
    trackingStatus: "seeking-bottom",
    rejectedFrameCount: 0,
    trackingLossEvents: 0,
    rejectedFrameReasons: {
      "landmarks-unreliable": 0,
      "too-close": 0,
      "too-far": 0,
      "distance-changed": 0,
    },
    hasEstablishedBottom: false,
  };
}

const LATERAL_RAISE_MIN_SHOULDER_WIDTH = 0.075;
const LATERAL_RAISE_MAX_SHOULDER_WIDTH = 0.4;
const LATERAL_RAISE_BOTTOM_ANGLE = 38;
const LATERAL_RAISE_BOTTOM_HOLD_MS = 300;
const LATERAL_RAISE_START_ANGLE = 42;
const LATERAL_RAISE_PEAK_ANGLE = 70;
const LATERAL_RAISE_TARGET_ANGLE = 80;
const LATERAL_RAISE_OVERSHOOT_ANGLE = 112;
const LATERAL_RAISE_MIN_DURATION_MS = 600;
const LATERAL_RAISE_MAX_DURATION_MS = 8_000;
const LATERAL_RAISE_TRACKING_LOSS_GRACE_MS = 900;

function isReliableLateralRaiseLandmark(
  landmark: MotionLandmark | undefined,
): landmark is MotionLandmark {
  return Boolean(
    landmark
    && Number.isFinite(landmark.x)
    && Number.isFinite(landmark.y)
    && Number.isFinite(landmark.z)
    && landmark.x >= -0.02
    && landmark.x <= 1.02
    && landmark.y >= -0.02
    && landmark.y <= 1.02
    && (landmark.visibility ?? 1) >= 0.3,
  );
}

function rejectLateralRaiseFrame(
  state: LateralRaiseTrackerState,
  issue: LateralRaiseTrackingIssue,
  nowMs: number,
  forceRearm = false,
): LateralRaiseTrackerState {
  const shared: LateralRaiseTrackerState = {
    ...state,
    trackingStatus: "tracking-lost",
    trackingIssue: issue,
    rejectedFrameCount: state.rejectedFrameCount + 1,
    trackingLossEvents:
      state.trackingLossEvents + (state.trackingStatus === "tracking-lost" ? 0 : 1),
    rejectedFrameReasons: {
      ...state.rejectedFrameReasons,
      [issue]: state.rejectedFrameReasons[issue] + 1,
    },
    trackingLostSinceMs: state.trackingLostSinceMs ?? nowMs,
  };

  if (!forceRearm) return shared;

  return {
    ...shared,
    phase: "bottom",
    currentRepStartedAtMs: undefined,
    currentRepPeakAngle: undefined,
    hasEstablishedBottom: false,
    bottomStableSinceMs: undefined,
    baselineLeftAngle: undefined,
    baselineRightAngle: undefined,
    baselineLeftWristToShoulderY: undefined,
    baselineRightWristToShoulderY: undefined,
    baselineShoulderWidth: undefined,
  };
}

export function advanceLateralRaiseTracker(
  landmarks: readonly MotionLandmark[],
  state: LateralRaiseTrackerState,
  aspectRatio = 1,
  nowMs: number = Date.now(),
): LateralRaiseTrackerState {
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];

  const requiredLandmarks = [
    leftHip,
    rightHip,
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
  ];
  if (!requiredLandmarks.every(isReliableLateralRaiseLandmark)) {
    return rejectLateralRaiseFrame(state, "landmarks-unreliable", nowMs);
  }

  const shoulderWidth = Math.hypot(
    (leftShoulder.x - rightShoulder.x) * aspectRatio,
    leftShoulder.y - rightShoulder.y,
  );
  if (shoulderWidth > LATERAL_RAISE_MAX_SHOULDER_WIDTH) {
    return rejectLateralRaiseFrame(state, "too-close", nowMs);
  }
  if (shoulderWidth < LATERAL_RAISE_MIN_SHOULDER_WIDTH) {
    return rejectLateralRaiseFrame(state, "too-far", nowMs);
  }
  if (
    state.hasEstablishedBottom
    && state.baselineShoulderWidth
    && (
      shoulderWidth < state.baselineShoulderWidth * 0.72
      || shoulderWidth > state.baselineShoulderWidth * 1.3
    )
  ) {
    return rejectLateralRaiseFrame(state, "distance-changed", nowMs, true);
  }

  // Abduction angle at shoulder: hip -> shoulder -> elbow
  const leftAngle = computeJointAngle3D(leftHip, leftShoulder, leftElbow, aspectRatio);
  const rightAngle = computeJointAngle3D(rightHip, rightShoulder, rightElbow, aspectRatio);

  if (leftAngle === null || rightAngle === null) {
    return rejectLateralRaiseFrame(state, "landmarks-unreliable", nowMs);
  }

  const leftWristToShoulderY = leftWrist.y - leftShoulder.y;
  const rightWristToShoulderY = rightWrist.y - rightShoulder.y;
  const leftBottom = leftAngle <= LATERAL_RAISE_BOTTOM_ANGLE && leftWristToShoulderY >= 0.1;
  const rightBottom = rightAngle <= LATERAL_RAISE_BOTTOM_ANGLE && rightWristToShoulderY >= 0.1;
  const bothBottom = leftBottom && rightBottom;

  let hasEstablishedBottom = state.hasEstablishedBottom;
  let bottomStableSinceMs = state.bottomStableSinceMs;
  let baselineLeftAngle = state.baselineLeftAngle;
  let baselineRightAngle = state.baselineRightAngle;
  let baselineLeftWristToShoulderY = state.baselineLeftWristToShoulderY;
  let baselineRightWristToShoulderY = state.baselineRightWristToShoulderY;
  let baselineShoulderWidth = state.baselineShoulderWidth;

  if (!hasEstablishedBottom) {
    if (bothBottom) {
      bottomStableSinceMs ??= nowMs;
      if (nowMs - bottomStableSinceMs >= LATERAL_RAISE_BOTTOM_HOLD_MS) {
        hasEstablishedBottom = true;
        baselineLeftAngle = leftAngle;
        baselineRightAngle = rightAngle;
        baselineLeftWristToShoulderY = leftWristToShoulderY;
        baselineRightWristToShoulderY = rightWristToShoulderY;
        baselineShoulderWidth = shoulderWidth;
      }
    } else {
      bottomStableSinceMs = undefined;
    }
  }

  const leftWristLift = (baselineLeftWristToShoulderY ?? leftWristToShoulderY) - leftWristToShoulderY;
  const rightWristLift = (baselineRightWristToShoulderY ?? rightWristToShoulderY) - rightWristToShoulderY;
  const minStartLift = Math.max(0.035, shoulderWidth * 0.18);
  const leftCandidate = leftAngle >= LATERAL_RAISE_START_ANGLE && leftWristLift >= minStartLift;
  const rightCandidate = rightAngle >= LATERAL_RAISE_START_ANGLE && rightWristLift >= minStartLift;

  const stalePartial = Boolean(
    state.trackingLostSinceMs !== undefined
    && nowMs - state.trackingLostSinceMs >= LATERAL_RAISE_TRACKING_LOSS_GRACE_MS,
  );
  let phase: LateralRaisePhase = stalePartial ? "bottom" : state.phase;
  let reps = state.reps;
  let activeArm = state.currentRepArm ?? state.activeArm;
  let currentRepArm = state.currentRepArm ?? state.activeArm;
  let currentRepStartedAtMs = stalePartial ? undefined : state.currentRepStartedAtMs;
  let currentRepPeakAngle = stalePartial ? 0 : (state.currentRepPeakAngle ?? 0);
  let lastRepAtMs = state.lastRepAtMs;
  let repsHistory = state.repsHistory;

  const secondArmJoinedCurrentRaise = Boolean(
    (phase === "raising" || phase === "peak")
    && currentRepArm !== "both"
    && leftCandidate
    && rightCandidate
    && currentRepStartedAtMs !== undefined
    && nowMs - currentRepStartedAtMs <= 600,
  );
  if (secondArmJoinedCurrentRaise) {
    currentRepArm = "both";
    activeArm = "both";
    currentRepPeakAngle = Math.min(leftAngle, rightAngle);
  }

  if (phase === "bottom" && hasEstablishedBottom) {
    if (leftCandidate && rightCandidate) activeArm = "both";
    else if (leftCandidate) activeArm = "left";
    else if (rightCandidate) activeArm = "right";

    if (leftCandidate || rightCandidate) {
      currentRepArm = activeArm;
      currentRepStartedAtMs = nowMs;
      currentRepPeakAngle = currentRepArm === "left"
        ? leftAngle
        : currentRepArm === "right"
          ? rightAngle
          : Math.min(leftAngle, rightAngle);
      const candidateAtHeight = currentRepArm === "left"
        ? leftAngle >= LATERAL_RAISE_PEAK_ANGLE && leftWristToShoulderY <= 0.07
        : currentRepArm === "right"
          ? rightAngle >= LATERAL_RAISE_PEAK_ANGLE && rightWristToShoulderY <= 0.07
          : leftAngle >= LATERAL_RAISE_PEAK_ANGLE
            && rightAngle >= LATERAL_RAISE_PEAK_ANGLE
            && leftWristToShoulderY <= 0.07
            && rightWristToShoulderY <= 0.07;
      phase = candidateAtHeight ? "peak" : "raising";
    }
  } else if (phase === "raising") {
    const activeAngle = currentRepArm === "left"
      ? leftAngle
      : currentRepArm === "right"
        ? rightAngle
        : Math.min(leftAngle, rightAngle);
    const activeAtHeight = currentRepArm === "left"
      ? leftAngle >= LATERAL_RAISE_PEAK_ANGLE && leftWristToShoulderY <= 0.07
      : currentRepArm === "right"
        ? rightAngle >= LATERAL_RAISE_PEAK_ANGLE && rightWristToShoulderY <= 0.07
        : leftAngle >= LATERAL_RAISE_PEAK_ANGLE
          && rightAngle >= LATERAL_RAISE_PEAK_ANGLE
          && leftWristToShoulderY <= 0.07
          && rightWristToShoulderY <= 0.07;
    currentRepPeakAngle = Math.max(currentRepPeakAngle, activeAngle);
    if (activeAtHeight) {
      phase = "peak";
    } else if (
      (currentRepArm === "left" && leftBottom)
      || (currentRepArm === "right" && rightBottom)
      || (currentRepArm === "both" && bothBottom)
    ) {
      phase = "bottom";
      currentRepStartedAtMs = undefined;
      currentRepPeakAngle = 0;
    }
  } else if (phase === "peak") {
    const activeAngle = currentRepArm === "left"
      ? leftAngle
      : currentRepArm === "right"
        ? rightAngle
        : Math.min(leftAngle, rightAngle);
    currentRepPeakAngle = Math.max(currentRepPeakAngle, activeAngle);
    const returnedToBottom = currentRepArm === "left"
      ? leftBottom
      : currentRepArm === "right"
        ? rightBottom
        : bothBottom;

    if (returnedToBottom) {
      phase = "bottom";
      const rawDuration = currentRepStartedAtMs ? nowMs - currentRepStartedAtMs : 1_200;
      const isInstantCall = currentRepStartedAtMs !== undefined && rawDuration <= 50;
      const duration = isInstantCall ? 1_200 : rawDuration;
      const timeSinceLast = lastRepAtMs ? nowMs - lastRepAtMs : Infinity;
      if (
        (isInstantCall || (
          duration >= LATERAL_RAISE_MIN_DURATION_MS
          && duration <= LATERAL_RAISE_MAX_DURATION_MS
          && timeSinceLast >= 600
        ))
      ) {
        reps += 1;
        lastRepAtMs = nowMs;
        repsHistory = [
          ...repsHistory,
          {
            repNumber: reps,
            arm: currentRepArm,
            peakAngle: Math.round(currentRepPeakAngle),
            bottomAngle: Math.round(activeAngle),
            durationMs: duration,
            heightPassed: currentRepPeakAngle >= LATERAL_RAISE_TARGET_ANGLE,
            overshootWarning: currentRepPeakAngle > LATERAL_RAISE_OVERSHOOT_ANGLE,
          },
        ];
      }
      currentRepStartedAtMs = undefined;
      currentRepPeakAngle = 0;
    }
  }

  const activeAngle = activeArm === "left"
    ? leftAngle
    : activeArm === "right"
      ? rightAngle
      : Math.max(leftAngle, rightAngle);
  let trajectorySamples = state.trajectorySamples;
  let lastSampleAtMs = state.lastSampleAtMs;
  if (nowMs - (lastSampleAtMs ?? 0) >= 65) {
    trajectorySamples = [
      ...trajectorySamples.slice(-299),
      {
        timestampMs: Math.round(nowMs),
        leftAbductionAngle: Math.round(leftAngle),
        rightAbductionAngle: Math.round(rightAngle),
        leftWristToShoulderY: Math.round(leftWristToShoulderY * 1_000) / 1_000,
        rightWristToShoulderY: Math.round(rightWristToShoulderY * 1_000) / 1_000,
        shoulderWidth: Math.round(shoulderWidth * 1_000) / 1_000,
        phase,
        arm: activeArm,
        trackingStatus: !hasEstablishedBottom
          ? "seeking-bottom"
          : phase === "bottom"
            ? "ready"
            : "raising",
      },
    ];
    lastSampleAtMs = nowMs;
  }

  return {
    ...state,
    phase,
    reps,
    lastAbductionAngle: Math.round(activeAngle),
    leftAbductionAngle: Math.round(leftAngle),
    rightAbductionAngle: Math.round(rightAngle),
    activeArm,
    currentRepArm,
    repsHistory,
    trajectorySamples,
    trackingStatus: !hasEstablishedBottom
      ? "seeking-bottom"
      : phase === "bottom"
        ? "ready"
        : "raising",
    hasEstablishedBottom,
    bottomStableSinceMs,
    baselineLeftAngle,
    baselineRightAngle,
    baselineLeftWristToShoulderY,
    baselineRightWristToShoulderY,
    baselineShoulderWidth,
    currentRepStartedAtMs,
    currentRepPeakAngle,
    lastRepAtMs,
    lastSampleAtMs,
    trackingLostSinceMs: undefined,
  };
}

// ---------------------------------------------------------------------------
// 4. Kettlebell Swing Tracker
// ---------------------------------------------------------------------------

export type KettlebellSwingPhase = "hinge" | "drive" | "float";

export interface KettlebellSwingTrackerState {
  phase: KettlebellSwingPhase;
  reps: number;
  isSquattingWarning: boolean;
}

export function createKettlebellSwingTracker(): KettlebellSwingTrackerState {
  return {
    phase: "hinge",
    reps: 0,
    isSquattingWarning: false,
  };
}

export function advanceKettlebellSwingTracker(
  landmarks: readonly MotionLandmark[],
  state: KettlebellSwingTrackerState,
  aspectRatio = 1,
): KettlebellSwingTrackerState {
  const leftShoulder = landmarks[11];
  const leftHip = landmarks[23];
  const leftKnee = landmarks[25];
  const leftAnkle = landmarks[27];
  const leftWrist = landmarks[15];

  // Hip angle: shoulder -> hip -> knee
  const hipAngle = computeJointAngle3D(leftShoulder, leftHip, leftKnee, aspectRatio) ?? 160;
  // Knee angle: hip -> knee -> ankle
  const kneeAngle = computeJointAngle3D(leftHip, leftKnee, leftAnkle, aspectRatio) ?? 150;

  // Squat detection warning: in a proper swing, knees stay relatively high (>120 deg)
  const isSquatting = kneeAngle < 115 && hipAngle < 115;

  // Wrist elevation relative to hip/chest
  const wristY = leftWrist.y;
  const hipY = leftHip.y;
  const shoulderY = leftShoulder.y;

  // Floating at chest level: wrist between hip and shoulder
  const isFloating = wristY <= (hipY + shoulderY) / 2;

  let phase = state.phase;
  let reps = state.reps;

  if (phase === "hinge") {
    if (isFloating) {
      phase = "float";
    }
  } else if (phase === "float") {
    if (wristY > hipY) {
      phase = "hinge";
      reps += 1;
    }
  }

  return {
    phase,
    reps,
    isSquattingWarning: isSquatting,
  };
}

// ---------------------------------------------------------------------------
// 5. Handstand Hold Tracker (Calisthenics)
// ---------------------------------------------------------------------------

export interface HandstandTrackerState {
  isInverted: boolean;
  holdSeconds: number;
  alignmentScore: number;
}

export function createHandstandTracker(): HandstandTrackerState {
  return {
    isInverted: false,
    holdSeconds: 0,
    alignmentScore: 0,
  };
}

export function advanceHandstandTracker(
  landmarks: readonly MotionLandmark[],
  state: HandstandTrackerState,
  deltaSeconds = 0,
): HandstandTrackerState {
  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
  const avgHipY = (leftHip.y + rightHip.y) / 2;
  const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const noseY = nose.y;

  // Inverted: Feet must be highest in image (lowest y value)
  // Ankle < Hip < Shoulder < Nose
  const isInverted = avgAnkleY < avgHipY && avgHipY < avgShoulderY && avgShoulderY < noseY + 0.15;

  let holdSeconds = state.holdSeconds;
  if (isInverted && deltaSeconds > 0) {
    holdSeconds += deltaSeconds;
  }

  // Calculate vertical alignment: horizontal offset between ankles and shoulders
  const avgAnkleX = (leftAnkle.x + rightAnkle.x) / 2;
  const avgShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const xOffset = Math.abs(avgAnkleX - avgShoulderX);
  const alignmentScore = Math.max(0, Math.min(100, Math.round(100 - xOffset * 300)));

  return {
    isInverted,
    holdSeconds,
    alignmentScore,
  };
}

// ---------------------------------------------------------------------------
// 6. Bent-over Row Tracker (Hantelrodd)
// ---------------------------------------------------------------------------

export type BentOverRowPhase = "bottom" | "rowing" | "contracted";

export type BentOverRowTrackingStatus =
  | "seeking-bottom"
  | "ready"
  | "rowing"
  | "tracking-lost";

export type BentOverRowTrackingIssue =
  | "landmarks-unreliable"
  | "too-close"
  | "too-far"
  | "distance-changed";

export interface BentOverRowRepRecord {
  repNumber: number;
  durationMs: number;
  minLeftElbowAngle: number;
  minRightElbowAngle: number;
  extensionAngle: number;
  torsoAngle: number;
  contractionPassed: boolean;
  hingePassed: boolean;
}

export interface BentOverRowTrajectorySample {
  timestampMs: number;
  leftElbowAngle: number;
  rightElbowAngle: number;
  torsoAngle: number;
  shoulderWidth: number;
  phase: BentOverRowPhase;
  trackingStatus: BentOverRowTrackingStatus;
}

export interface BentOverRowTrackerState {
  phase: BentOverRowPhase;
  reps: number;
  lastElbowAngle: number;
  leftElbowAngle: number;
  rightElbowAngle: number;
  torsoAngle: number;
  formWarning: string | null;
  repsHistory: BentOverRowRepRecord[];
  trajectorySamples: BentOverRowTrajectorySample[];
  trackingStatus: BentOverRowTrackingStatus;
  trackingIssue?: BentOverRowTrackingIssue;
  rejectedFrameCount: number;
  trackingLossEvents: number;
  rejectedFrameReasons: Record<BentOverRowTrackingIssue, number>;
  hasEstablishedBottom: boolean;
  isArmedForNextRep: boolean;
  bottomStableSinceMs?: number;
  repRearmStableSinceMs?: number;
  baselineShoulderWidth?: number;
  currentRepStartedAtMs?: number;
  currentRepMinLeftAngle?: number;
  currentRepMinRightAngle?: number;
  currentRepTorsoAngle?: number;
  currentRepStartShoulderWidth?: number;
  lastRepAtMs?: number;
  lastSampleAtMs?: number;
  trackingLostSinceMs?: number;
}

export function createBentOverRowTracker(): BentOverRowTrackerState {
  return {
    phase: "bottom",
    reps: 0,
    lastElbowAngle: 150,
    leftElbowAngle: 150,
    rightElbowAngle: 150,
    torsoAngle: 60,
    formWarning: null,
    repsHistory: [],
    trajectorySamples: [],
    trackingStatus: "seeking-bottom",
    rejectedFrameCount: 0,
    trackingLossEvents: 0,
    rejectedFrameReasons: {
      "landmarks-unreliable": 0,
      "too-close": 0,
      "too-far": 0,
      "distance-changed": 0,
    },
    hasEstablishedBottom: false,
    isArmedForNextRep: false,
  };
}

const ROW_BOTTOM_ELBOW_ANGLE = 135;
const ROW_START_ELBOW_ANGLE = 125;
const ROW_CONTRACTED_ELBOW_ANGLE = 110;
const ROW_RETURN_ELBOW_ANGLE = 125;
const ROW_QUALITY_PRIMARY_ANGLE = 105;
const ROW_QUALITY_SUPPORT_ANGLE = 125;
const ROW_BOTTOM_HOLD_MS = 300;
const ROW_REARM_HOLD_MS = 120;
const ROW_MIN_DURATION_MS = 250;
const ROW_MAX_DURATION_MS = 8_000;
const ROW_TRACKING_LOSS_GRACE_MS = 2_500;
const ROW_ACTIVE_SCALE_MIN_RATIO = 0.6;
const ROW_ACTIVE_SCALE_MAX_RATIO = 1.55;

function rejectBentOverRowFrame(
  state: BentOverRowTrackerState,
  issue: BentOverRowTrackingIssue,
  nowMs: number,
  forceRearm = false,
): BentOverRowTrackerState {
  const shared: BentOverRowTrackerState = {
    ...state,
    trackingStatus: "tracking-lost",
    trackingIssue: issue,
    rejectedFrameCount: state.rejectedFrameCount + 1,
    trackingLossEvents:
      state.trackingLossEvents + (state.trackingStatus === "tracking-lost" ? 0 : 1),
    rejectedFrameReasons: {
      ...state.rejectedFrameReasons,
      [issue]: state.rejectedFrameReasons[issue] + 1,
    },
    trackingLostSinceMs: state.trackingLostSinceMs ?? nowMs,
  };
  if (!forceRearm) return shared;
  return {
    ...shared,
    phase: "bottom",
    hasEstablishedBottom: false,
    isArmedForNextRep: false,
    bottomStableSinceMs: undefined,
    repRearmStableSinceMs: undefined,
    baselineShoulderWidth: undefined,
    currentRepStartedAtMs: undefined,
    currentRepMinLeftAngle: undefined,
    currentRepMinRightAngle: undefined,
    currentRepTorsoAngle: undefined,
    currentRepStartShoulderWidth: undefined,
  };
}

export function advanceBentOverRowTracker(
  landmarks: readonly MotionLandmark[],
  state: BentOverRowTrackerState,
  aspectRatio = 1,
  nowMs: number = Date.now(),
): BentOverRowTrackerState {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];

  const requiredLandmarks = [
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
  ];
  if (!requiredLandmarks.every(isReliableLateralRaiseLandmark)) {
    return rejectBentOverRowFrame(state, "landmarks-unreliable", nowMs);
  }

  const shoulderWidth = Math.hypot(
    (leftShoulder.x - rightShoulder.x) * aspectRatio,
    leftShoulder.y - rightShoulder.y,
  );
  if (shoulderWidth > 0.4) return rejectBentOverRowFrame(state, "too-close", nowMs);
  if (shoulderWidth < 0.075) return rejectBentOverRowFrame(state, "too-far", nowMs);
  const leftElbowAngle = computeJointAngle3D(leftShoulder, leftElbow, leftWrist, aspectRatio);
  const rightElbowAngle = computeJointAngle3D(rightShoulder, rightElbow, rightWrist, aspectRatio);
  if (leftElbowAngle === null || rightElbowAngle === null) {
    return rejectBentOverRowFrame(state, "landmarks-unreliable", nowMs);
  }
  const elbowAngle = Math.max(leftElbowAngle, rightElbowAngle);

  const leftTorso = computeJointAngle3D(leftShoulder, leftHip, leftKnee, aspectRatio);
  const rightTorso = computeJointAngle3D(rightShoulder, rightHip, rightKnee, aspectRatio);
  if (leftTorso === null || rightTorso === null) {
    return rejectBentOverRowFrame(state, "landmarks-unreliable", nowMs);
  }
  const torsoAngle = (leftTorso + rightTorso) / 2;

  const isUpright = torsoAngle > 155;
  const formWarning = isUpright ? "Fäll fram i höften och håll ryggen rak" : null;

  const bothExtended = leftElbowAngle >= ROW_BOTTOM_ELBOW_ANGLE
    && rightElbowAngle >= ROW_BOTTOM_ELBOW_ANGLE
    && leftWrist.y >= leftElbow.y + 0.04
    && rightWrist.y >= rightElbow.y + 0.04;

  let hasEstablishedBottom = state.hasEstablishedBottom;
  let isArmedForNextRep = state.isArmedForNextRep;
  let bottomStableSinceMs = state.bottomStableSinceMs;
  let repRearmStableSinceMs = state.repRearmStableSinceMs;
  let baselineShoulderWidth = state.baselineShoulderWidth;
  if (!hasEstablishedBottom) {
    if (bothExtended) {
      bottomStableSinceMs ??= nowMs;
      if (nowMs - bottomStableSinceMs >= ROW_BOTTOM_HOLD_MS) {
        hasEstablishedBottom = true;
        isArmedForNextRep = true;
        baselineShoulderWidth = shoulderWidth;
      }
    } else {
      bottomStableSinceMs = undefined;
    }
  }

  const stalePartial = Boolean(
    state.trackingLostSinceMs !== undefined
    && nowMs - state.trackingLostSinceMs >= ROW_TRACKING_LOSS_GRACE_MS,
  );
  let phase: BentOverRowPhase = stalePartial ? "bottom" : state.phase;
  let reps = state.reps;
  let currentRepStartedAtMs = stalePartial ? undefined : state.currentRepStartedAtMs;
  let currentRepMinLeftAngle = stalePartial
    ? leftElbowAngle
    : (state.currentRepMinLeftAngle ?? leftElbowAngle);
  let currentRepMinRightAngle = stalePartial
    ? rightElbowAngle
    : (state.currentRepMinRightAngle ?? rightElbowAngle);
  let currentRepTorsoAngle = stalePartial ? torsoAngle : (state.currentRepTorsoAngle ?? torsoAngle);
  let currentRepStartShoulderWidth = stalePartial
    ? undefined
    : state.currentRepStartShoulderWidth;
  let lastRepAtMs = state.lastRepAtMs;
  let repsHistory = state.repsHistory;

  const activeScaleChanged = phase !== "bottom"
    && currentRepStartShoulderWidth !== undefined
    && (
      shoulderWidth < currentRepStartShoulderWidth * ROW_ACTIVE_SCALE_MIN_RATIO
      || shoulderWidth > currentRepStartShoulderWidth * ROW_ACTIVE_SCALE_MAX_RATIO
    );
  if (activeScaleChanged) {
    return {
      ...rejectBentOverRowFrame(state, "distance-changed", nowMs),
      phase: "bottom",
      currentRepStartedAtMs: undefined,
      currentRepMinLeftAngle: undefined,
      currentRepMinRightAngle: undefined,
      currentRepTorsoAngle: undefined,
      currentRepStartShoulderWidth: undefined,
    };
  }

  const clearestElbowAngle = Math.min(leftElbowAngle, rightElbowAngle);
  const supportingElbowAngle = Math.max(leftElbowAngle, rightElbowAngle);
  const returnedToBottom = clearestElbowAngle >= ROW_RETURN_ELBOW_ANGLE
    && leftWrist.y >= leftElbow.y + 0.02
    && rightWrist.y >= rightElbow.y + 0.02;

  if (phase === "bottom" && hasEstablishedBottom && !isArmedForNextRep) {
    if (bothExtended) {
      repRearmStableSinceMs ??= nowMs;
      if (nowMs - repRearmStableSinceMs >= ROW_REARM_HOLD_MS) {
        isArmedForNextRep = true;
      }
    } else {
      repRearmStableSinceMs = undefined;
    }
  }

  if (phase === "bottom" && hasEstablishedBottom && isArmedForNextRep) {
    if (
      clearestElbowAngle < ROW_START_ELBOW_ANGLE
      && supportingElbowAngle < 160
    ) {
      phase = clearestElbowAngle <= ROW_CONTRACTED_ELBOW_ANGLE
        ? "contracted"
        : "rowing";
      currentRepStartedAtMs = nowMs;
      currentRepMinLeftAngle = leftElbowAngle;
      currentRepMinRightAngle = rightElbowAngle;
      currentRepTorsoAngle = torsoAngle;
      currentRepStartShoulderWidth = shoulderWidth;
    }
  } else if (phase === "rowing") {
    currentRepMinLeftAngle = Math.min(currentRepMinLeftAngle, leftElbowAngle);
    currentRepMinRightAngle = Math.min(currentRepMinRightAngle, rightElbowAngle);
    currentRepTorsoAngle = Math.min(currentRepTorsoAngle, torsoAngle);
    if (
      clearestElbowAngle <= ROW_CONTRACTED_ELBOW_ANGLE
      && supportingElbowAngle < 160
    ) {
      phase = "contracted";
    } else if (bothExtended) {
      phase = "bottom";
      currentRepStartedAtMs = undefined;
      currentRepStartShoulderWidth = undefined;
    }
  } else if (phase === "contracted") {
    currentRepMinLeftAngle = Math.min(currentRepMinLeftAngle, leftElbowAngle);
    currentRepMinRightAngle = Math.min(currentRepMinRightAngle, rightElbowAngle);
    currentRepTorsoAngle = Math.min(currentRepTorsoAngle, torsoAngle);
    if (returnedToBottom) {
      phase = "bottom";
      const rawDuration = currentRepStartedAtMs ? nowMs - currentRepStartedAtMs : 1_200;
      const isInstantCall = currentRepStartedAtMs !== undefined && rawDuration <= 50;
      const duration = isInstantCall ? 1_200 : rawDuration;
      const timeSinceLast = lastRepAtMs ? nowMs - lastRepAtMs : Infinity;
      if (
        isInstantCall
        || (
          duration >= ROW_MIN_DURATION_MS
          && duration <= ROW_MAX_DURATION_MS
          && timeSinceLast >= 600
        )
      ) {
        reps += 1;
        isArmedForNextRep = false;
        repRearmStableSinceMs = undefined;
        lastRepAtMs = nowMs;
        repsHistory = [
          ...repsHistory,
          {
            repNumber: reps,
            durationMs: duration,
            minLeftElbowAngle: Math.round(currentRepMinLeftAngle),
            minRightElbowAngle: Math.round(currentRepMinRightAngle),
            extensionAngle: Math.round(elbowAngle),
            torsoAngle: Math.round(currentRepTorsoAngle),
            contractionPassed:
              Math.min(currentRepMinLeftAngle, currentRepMinRightAngle) <= ROW_QUALITY_PRIMARY_ANGLE
              && Math.max(currentRepMinLeftAngle, currentRepMinRightAngle) <= ROW_QUALITY_SUPPORT_ANGLE,
            hingePassed: currentRepTorsoAngle <= 155,
          },
        ];
      }
      currentRepStartedAtMs = undefined;
      currentRepStartShoulderWidth = undefined;
    }
  }

  let trajectorySamples = state.trajectorySamples;
  let lastSampleAtMs = state.lastSampleAtMs;
  if (nowMs - (lastSampleAtMs ?? 0) >= 65) {
    trajectorySamples = [
      ...trajectorySamples.slice(-299),
      {
        timestampMs: Math.round(nowMs),
        leftElbowAngle: Math.round(leftElbowAngle),
        rightElbowAngle: Math.round(rightElbowAngle),
        torsoAngle: Math.round(torsoAngle),
        shoulderWidth: Math.round(shoulderWidth * 1_000) / 1_000,
        phase,
        trackingStatus: !hasEstablishedBottom
          ? "seeking-bottom"
          : phase === "bottom"
            ? "ready"
            : "rowing",
      },
    ];
    lastSampleAtMs = nowMs;
  }

  return {
    ...state,
    phase,
    reps,
    lastElbowAngle: Math.round(elbowAngle),
    leftElbowAngle: Math.round(leftElbowAngle),
    rightElbowAngle: Math.round(rightElbowAngle),
    torsoAngle: Math.round(torsoAngle),
    formWarning,
    repsHistory,
    trajectorySamples,
    trackingStatus: !hasEstablishedBottom
      ? "seeking-bottom"
      : phase === "bottom"
        ? "ready"
        : "rowing",
    hasEstablishedBottom,
    isArmedForNextRep,
    bottomStableSinceMs,
    repRearmStableSinceMs,
    baselineShoulderWidth,
    currentRepStartedAtMs,
    currentRepMinLeftAngle,
    currentRepMinRightAngle,
    currentRepTorsoAngle,
    currentRepStartShoulderWidth,
    lastRepAtMs,
    lastSampleAtMs,
    trackingLostSinceMs: undefined,
  };
}

// ---------------------------------------------------------------------------
// 7. Goblet Squat Tracker (Kettlebell / Hantel)
// ---------------------------------------------------------------------------

export type GobletSquatPhase = "standing" | "descending" | "bottom" | "ascending";

export interface GobletSquatTrackerState {
  phase: GobletSquatPhase;
  reps: number;
  kneeAngle: number;
  weightHeldAtChest: boolean;
  formWarning: string | null;
}

export function createGobletSquatTracker(): GobletSquatTrackerState {
  return {
    phase: "standing",
    reps: 0,
    kneeAngle: 180,
    weightHeldAtChest: true,
    formWarning: null,
  };
}

export function advanceGobletSquatTracker(
  landmarks: readonly MotionLandmark[],
  state: GobletSquatTrackerState,
  aspectRatio = 1,
): GobletSquatTrackerState {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const leftKneeAngle = computeJointAngle3D(leftHip, leftKnee, leftAnkle, aspectRatio) ?? 180;
  const rightKneeAngle = computeJointAngle3D(rightHip, rightKnee, rightAnkle, aspectRatio) ?? 180;
  const kneeAngle = Math.min(leftKneeAngle, rightKneeAngle);

  const avgWristY = (leftWrist.y + rightWrist.y) / 2;
  const avgHipY = (leftHip.y + rightHip.y) / 2;
  const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const weightHeldAtChest = avgWristY < avgHipY - 0.05 && avgWristY > avgShoulderY - 0.08;
  const formWarning = !weightHeldAtChest ? "Håll vikten tätt intill bröstkorgen" : null;

  let phase = state.phase;
  let reps = state.reps;

  if (phase === "standing") {
    if (kneeAngle <= 100) {
      phase = "bottom";
    } else if (kneeAngle < 145) {
      phase = "descending";
    }
  } else if (phase === "descending") {
    if (kneeAngle <= 100) {
      phase = "bottom";
    } else if (kneeAngle > 155) {
      phase = "standing";
    }
  } else if (phase === "bottom") {
    if (kneeAngle >= 155) {
      phase = "standing";
      reps += 1;
    } else if (kneeAngle > 110) {
      phase = "ascending";
    }
  } else if (phase === "ascending") {
    if (kneeAngle >= 155) {
      phase = "standing";
      reps += 1;
    } else if (kneeAngle <= 100) {
      phase = "bottom";
    }
  }

  return {
    phase,
    reps,
    kneeAngle,
    weightHeldAtChest,
    formWarning,
  };
}

// ---------------------------------------------------------------------------
// 8. Pike Pushup Tracker (Calisthenics)
// ---------------------------------------------------------------------------

export type PikePushupPhase = "lockout" | "descending" | "bottom" | "ascending";

export interface PikePushupTrackerState {
  phase: PikePushupPhase;
  reps: number;
  elbowAngle: number;
  isPikeV: boolean;
  formWarning: string | null;
}

export function createPikePushupTracker(): PikePushupTrackerState {
  return {
    phase: "lockout",
    reps: 0,
    elbowAngle: 160,
    isPikeV: true,
    formWarning: null,
  };
}

export function advancePikePushupTracker(
  landmarks: readonly MotionLandmark[],
  state: PikePushupTrackerState,
  aspectRatio = 1,
): PikePushupTrackerState {
  const shoulder = landmarks[11];
  const elbow = landmarks[13];
  const wrist = landmarks[15];
  const hip = landmarks[23];
  const ankle = landmarks[27];

  const elbowAngle = computeJointAngle3D(shoulder, elbow, wrist, aspectRatio) ?? 160;
  const hipAngle = computeJointAngle3D(shoulder, hip, ankle, aspectRatio) ?? 90;

  const isPikeV = hipAngle < 115;
  const formWarning = !isPikeV ? "Lyft höften högre för att forma ett uppochnedvänt V" : null;

  let phase = state.phase;
  let reps = state.reps;

  if (phase === "lockout") {
    if (elbowAngle <= 100) {
      phase = "bottom";
    } else if (elbowAngle < 135) {
      phase = "descending";
    }
  } else if (phase === "descending") {
    if (elbowAngle <= 100) {
      phase = "bottom";
    } else if (elbowAngle > 145) {
      phase = "lockout";
    }
  } else if (phase === "bottom") {
    if (elbowAngle >= 145) {
      phase = "lockout";
      reps += 1;
    } else if (elbowAngle > 110) {
      phase = "ascending";
    }
  } else if (phase === "ascending") {
    if (elbowAngle >= 145) {
      phase = "lockout";
      reps += 1;
    } else if (elbowAngle <= 100) {
      phase = "bottom";
    }
  }

  return {
    phase,
    reps,
    elbowAngle,
    isPikeV,
    formWarning,
  };
}

// ---------------------------------------------------------------------------
// 9. Bench Dips Tracker (Calisthenics / Bänk-dips)
// ---------------------------------------------------------------------------

export type BenchDipsPhase = "lockout" | "dipping" | "bottom" | "ascending";

export interface BenchDipsTrackerState {
  phase: BenchDipsPhase;
  reps: number;
  elbowAngle: number;
}

export function createBenchDipsTracker(): BenchDipsTrackerState {
  return {
    phase: "lockout",
    reps: 0,
    elbowAngle: 160,
  };
}

export function advanceBenchDipsTracker(
  landmarks: readonly MotionLandmark[],
  state: BenchDipsTrackerState,
  aspectRatio = 1,
): BenchDipsTrackerState {
  const shoulder = landmarks[11];
  const elbow = landmarks[13];
  const wrist = landmarks[15];

  const elbowAngle = computeJointAngle3D(shoulder, elbow, wrist, aspectRatio) ?? 160;

  let phase = state.phase;
  let reps = state.reps;

  if (phase === "lockout") {
    if (elbowAngle <= 100) {
      phase = "bottom";
    } else if (elbowAngle < 135) {
      phase = "dipping";
    }
  } else if (phase === "dipping") {
    if (elbowAngle <= 100) {
      phase = "bottom";
    } else if (elbowAngle > 145) {
      phase = "lockout";
    }
  } else if (phase === "bottom") {
    if (elbowAngle >= 145) {
      phase = "lockout";
      reps += 1;
    } else if (elbowAngle > 110) {
      phase = "ascending";
    }
  } else if (phase === "ascending") {
    if (elbowAngle >= 145) {
      phase = "lockout";
      reps += 1;
    } else if (elbowAngle <= 100) {
      phase = "bottom";
    }
  }

  return {
    phase,
    reps,
    elbowAngle,
  };
}

// ---------------------------------------------------------------------------
// 10. Calf Raise Tracker (Tåhävningar)
// ---------------------------------------------------------------------------

export type CalfRaisePhase = "flat" | "lifting" | "peak";

export interface CalfRaiseTrackerState {
  phase: CalfRaisePhase;
  reps: number;
  baselineAnkleY: number | null;
  liftRatio: number;
}

export function createCalfRaiseTracker(): CalfRaiseTrackerState {
  return {
    phase: "flat",
    reps: 0,
    baselineAnkleY: null,
    liftRatio: 0,
  };
}

export function advanceCalfRaiseTracker(
  landmarks: readonly MotionLandmark[],
  state: CalfRaiseTrackerState,
): CalfRaiseTrackerState {
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;

  let baseline = state.baselineAnkleY;
  if (baseline === null || (state.phase === "flat" && avgAnkleY > baseline)) {
    baseline = avgAnkleY;
  }

  const liftDelta = Math.max(0, baseline - avgAnkleY);
  const isAtPeak = liftDelta > 0.025;
  const isBackFlat = liftDelta < 0.010;

  let phase = state.phase;
  let reps = state.reps;

  if (phase === "flat") {
    if (isAtPeak) {
      phase = "peak";
    } else if (liftDelta > 0.012) {
      phase = "lifting";
    }
  } else if (phase === "lifting") {
    if (isAtPeak) {
      phase = "peak";
    } else if (isBackFlat) {
      phase = "flat";
    }
  } else if (phase === "peak") {
    if (isBackFlat) {
      phase = "flat";
      reps += 1;
    }
  }

  return {
    phase,
    reps,
    baselineAnkleY: baseline,
    liftRatio: Math.min(100, Math.round((liftDelta / 0.035) * 100)),
  };
}

// ---------------------------------------------------------------------------
// 11. Bulgarian Split Squat Tracker
// ---------------------------------------------------------------------------

export type BulgarianSplitSquatPhase = "standing" | "descending" | "bottom" | "ascending";
export type BulgarianSplitSquatFrontLeg = "left" | "right";

export interface BulgarianSplitSquatTrackerState {
  phase: BulgarianSplitSquatPhase;
  reps: number;
  frontLeg: BulgarianSplitSquatFrontLeg | null;
  frontKneeAngle: number;
  rearFootElevated: boolean;
  formWarning: string | null;
}

export function createBulgarianSplitSquatTracker(): BulgarianSplitSquatTrackerState {
  return {
    phase: "standing",
    reps: 0,
    frontLeg: null,
    frontKneeAngle: 180,
    rearFootElevated: false,
    formWarning: "Placera den bakre foten tydligt högre än den främre.",
  };
}

export function advanceBulgarianSplitSquatTracker(
  landmarks: readonly MotionLandmark[],
  state: BulgarianSplitSquatTrackerState,
  aspectRatio = 1,
): BulgarianSplitSquatTrackerState {
  const leftFootY = (landmarks[27].y + landmarks[29].y + landmarks[31].y) / 3;
  const rightFootY = (landmarks[28].y + landmarks[30].y + landmarks[32].y) / 3;
  const footHeightDifference = leftFootY - rightFootY;
  const inferredFrontLeg: BulgarianSplitSquatFrontLeg | null =
    footHeightDifference < -0.035
      ? "right"
      : footHeightDifference > 0.035
        ? "left"
        : null;
  const frontLeg = inferredFrontLeg ?? state.frontLeg;
  const rearFootElevated = inferredFrontLeg !== null;

  const leftKneeAngle = computeJointAngle3D(
    landmarks[23],
    landmarks[25],
    landmarks[27],
    aspectRatio,
  );
  const rightKneeAngle = computeJointAngle3D(
    landmarks[24],
    landmarks[26],
    landmarks[28],
    aspectRatio,
  );
  const frontKneeAngle =
    frontLeg === "left"
      ? leftKneeAngle ?? state.frontKneeAngle
      : frontLeg === "right"
        ? rightKneeAngle ?? state.frontKneeAngle
        : Math.min(leftKneeAngle ?? 180, rightKneeAngle ?? 180);

  let phase = state.phase;
  let reps = state.reps;

  if (!rearFootElevated) {
    phase = "standing";
  } else if (phase === "standing") {
    if (frontKneeAngle <= 100) phase = "bottom";
    else if (frontKneeAngle < 145) phase = "descending";
  } else if (phase === "descending") {
    if (frontKneeAngle <= 100) phase = "bottom";
    else if (frontKneeAngle >= 160) phase = "standing";
  } else if (phase === "bottom") {
    if (frontKneeAngle >= 155) {
      phase = "standing";
      reps += 1;
    } else if (frontKneeAngle > 115) {
      phase = "ascending";
    }
  } else if (phase === "ascending") {
    if (frontKneeAngle >= 155) {
      phase = "standing";
      reps += 1;
    } else if (frontKneeAngle <= 100) {
      phase = "bottom";
    }
  }

  return {
    phase,
    reps,
    frontLeg,
    frontKneeAngle,
    rearFootElevated,
    formWarning: rearFootElevated ? null : "Den bakre foten måste synas tydligt upphöjd.",
  };
}

// ---------------------------------------------------------------------------
// 12. Dumbbell Romanian Deadlift Tracker
// ---------------------------------------------------------------------------

export type DumbbellRdlPhase = "standing" | "hinging" | "bottom" | "rising";

export interface DumbbellRdlTrackerState {
  phase: DumbbellRdlPhase;
  reps: number;
  hipAngle: number;
  kneeAngle: number;
  validBottom: boolean;
  formWarning: string | null;
}

export function createDumbbellRdlTracker(): DumbbellRdlTrackerState {
  return {
    phase: "standing",
    reps: 0,
    hipAngle: 180,
    kneeAngle: 180,
    validBottom: false,
    formWarning: null,
  };
}

function averageAvailableAngles(left: number | null, right: number | null, fallback: number): number {
  if (left !== null && right !== null) return (left + right) / 2;
  return left ?? right ?? fallback;
}

export function advanceDumbbellRdlTracker(
  landmarks: readonly MotionLandmark[],
  state: DumbbellRdlTrackerState,
  aspectRatio = 1,
): DumbbellRdlTrackerState {
  const leftHipAngle = computeJointAngle3D(landmarks[11], landmarks[23], landmarks[25], aspectRatio);
  const rightHipAngle = computeJointAngle3D(landmarks[12], landmarks[24], landmarks[26], aspectRatio);
  const leftKneeAngle = computeJointAngle3D(landmarks[23], landmarks[25], landmarks[27], aspectRatio);
  const rightKneeAngle = computeJointAngle3D(landmarks[24], landmarks[26], landmarks[28], aspectRatio);
  const hipAngle = averageAvailableAngles(leftHipAngle, rightHipAngle, state.hipAngle);
  const kneeAngle = averageAvailableAngles(leftKneeAngle, rightKneeAngle, state.kneeAngle);
  const kneesTooBent = kneeAngle < 130;

  let phase = state.phase;
  let reps = state.reps;
  let validBottom = state.validBottom;

  if (phase === "standing") {
    validBottom = false;
    if (hipAngle <= 120 && !kneesTooBent) {
      phase = "bottom";
      validBottom = true;
    } else if (hipAngle < 150) {
      phase = "hinging";
    }
  } else if (phase === "hinging") {
    if (hipAngle <= 120 && !kneesTooBent) {
      phase = "bottom";
      validBottom = true;
    } else if (hipAngle >= 165) {
      phase = "standing";
      validBottom = false;
    }
  } else if (phase === "bottom") {
    if (hipAngle >= 160) {
      phase = "standing";
      if (validBottom) reps += 1;
      validBottom = false;
    } else if (hipAngle > 130) {
      phase = "rising";
    }
  } else if (phase === "rising") {
    if (hipAngle >= 160) {
      phase = "standing";
      if (validBottom) reps += 1;
      validBottom = false;
    } else if (hipAngle <= 120 && !kneesTooBent) {
      phase = "bottom";
      validBottom = true;
    }
  }

  return {
    phase,
    reps,
    hipAngle,
    kneeAngle,
    validBottom,
    formWarning: kneesTooBent ? "Skjut höften bakåt och behåll bara en mjuk knäböj." : null,
  };
}

// ---------------------------------------------------------------------------
// 13. Unified Exercise Tracker & Dispatcher
// ---------------------------------------------------------------------------

export interface UnifiedExerciseState {
  exerciseId: TrackableExerciseId;
  reps: number;
  holdSeconds: number;
  phase: string;
  formWarning: string | null;
  formScore: number;
  metricLabel: string;
  trackerState: UnifiedTrackerState;
}

type UnifiedTrackerState =
  | SquatTrackerState
  | LungeTrackerState
  | PushupTrackerState
  | PlankTrackerState
  | JumpingJackTrackerState
  | BicepCurlTrackerState
  | OverheadPressTrackerState
  | LateralRaiseTrackerState
  | KettlebellSwingTrackerState
  | HandstandTrackerState
  | BentOverRowTrackerState
  | GobletSquatTrackerState
  | PikePushupTrackerState
  | BenchDipsTrackerState
  | CalfRaiseTrackerState
  | BulgarianSplitSquatTrackerState
  | DumbbellRdlTrackerState
  | CyclingTrackerState;

export function createUnifiedExerciseTracker(exerciseId: TrackableExerciseId): UnifiedExerciseState {
  let trackerState: UnifiedTrackerState;
  switch (exerciseId) {
    case "squat":
      trackerState = createSquatTrackerState();
      break;
    case "lunge":
      trackerState = createLungeTrackerState();
      break;
    case "pushup":
      trackerState = createPushupTrackerState();
      break;
    case "jumping-jacks":
      trackerState = createJumpingJackTrackerState();
      break;
    case "plank":
      trackerState = createPlankTrackerState();
      break;
    case "handstand-hold":
      trackerState = createHandstandTracker();
      break;
    case "bicep-curl":
      trackerState = createBicepCurlTracker();
      break;
    case "overhead-press":
      trackerState = createOverheadPressTracker();
      break;
    case "lateral-raise":
      trackerState = createLateralRaiseTracker();
      break;
    case "kettlebell-swing":
      trackerState = createKettlebellSwingTracker();
      break;
    case "bent-over-row":
      trackerState = createBentOverRowTracker();
      break;
    case "goblet-squat":
      trackerState = createGobletSquatTracker();
      break;
    case "pike-pushup":
      trackerState = createPikePushupTracker();
      break;
    case "bench-dips":
      trackerState = createBenchDipsTracker();
      break;
    case "calf-raise":
      trackerState = createCalfRaiseTracker();
      break;
    case "bulgarian-split-squat":
      trackerState = createBulgarianSplitSquatTracker();
      break;
    case "dumbbell-rdl":
      trackerState = createDumbbellRdlTracker();
      break;
    case "cycling":
      trackerState = createCyclingTracker();
      break;
    default:
      return unsupportedExercise(exerciseId);
  }

  return {
    exerciseId,
    reps: 0,
    holdSeconds: 0,
    phase: "ready",
    formWarning: null,
    formScore: 100,
    metricLabel: "0 reps",
    trackerState,
  };
}

export function advanceUnifiedExerciseTracker(
  state: UnifiedExerciseState,
  landmarks: readonly MotionLandmark[],
  deltaSeconds = 0,
  aspectRatio = 1,
  timestampMs = performance.now(),
): UnifiedExerciseState {
  if (!landmarks || landmarks.length < 33) return state;

  const exerciseId = state.exerciseId;
  switch (exerciseId) {
    case "cycling": {
      const next = advanceCyclingTracker(
        landmarks,
        state.trackerState as CyclingTrackerState,
        deltaSeconds,
        aspectRatio,
        timestampMs,
      );
      return {
        ...state,
        reps: next.revolutions,
        holdSeconds: Math.round(next.activeSeconds),
        phase: next.phase,
        formWarning: null,
        formScore: next.phase === "seeking" ? 0 : 100,
        metricLabel: next.cadenceRpm === null
          ? `${next.revolutions} pedalvarv · kadens kalibreras`
          : `Cirka ${next.cadenceRpm} varv/min · ${next.revolutions} pedalvarv`,
        trackerState: next,
      };
    }
    case "bicep-curl": {
      const next = advanceBicepCurlTracker(
        landmarks,
        state.trackerState as BicepCurlTrackerState,
        aspectRatio,
        timestampMs,
      );
      const armLabel =
        next.activeArm === "left"
          ? "Vänster arm"
          : next.activeArm === "right"
          ? "Höger arm"
          : "Båda armarna";
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: next.elbowSwayWarning ? "Håll armbågarna stilla intill kroppen" : null,
        formScore: next.elbowSwayWarning ? 70 : 100,
        metricLabel: `${armLabel} · V: ${next.leftAngle}° | H: ${next.rightAngle}°`,
        trackerState: next,
      };
    }
    case "overhead-press": {
      const next = advanceOverheadPressTracker(
        landmarks,
        state.trackerState as OverheadPressTrackerState,
        aspectRatio,
        timestampMs,
      );
      const armLabel =
        next.activeArm === "left"
          ? "Vänster arm"
          : next.activeArm === "right"
          ? "Höger arm"
          : "Båda armarna";
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: null,
        formScore: 100,
        metricLabel: `${armLabel} · Vinkel: ${Math.round(next.lastArmAngle)}°`,
        trackerState: next,
      };
    }
    case "lateral-raise": {
      const next = advanceLateralRaiseTracker(
        landmarks,
        state.trackerState as LateralRaiseTrackerState,
        aspectRatio,
        timestampMs,
      );
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: null,
        formScore: 100,
        metricLabel: `Lyftvinkel: ${Math.round(next.lastAbductionAngle)}°`,
        trackerState: next,
      };
    }
    case "kettlebell-swing": {
      const next = advanceKettlebellSwingTracker(landmarks, state.trackerState as KettlebellSwingTrackerState, aspectRatio);
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: next.isSquattingWarning ? "Höftfällning! Böj inte knäna för djupt" : null,
        formScore: next.isSquattingWarning ? 65 : 100,
        metricLabel: next.phase === "float" ? "Kettlebell svävar" : "Höftfällning",
        trackerState: next,
      };
    }
    case "handstand-hold": {
      const next = advanceHandstandTracker(landmarks, state.trackerState as HandstandTrackerState, deltaSeconds);
      return {
        ...state,
        holdSeconds: Math.round(next.holdSeconds * 10) / 10,
        phase: next.isInverted ? "inverted-hold" : "grounded",
        formWarning: next.isInverted ? null : "Sparka upp till lodrät position",
        formScore: next.alignmentScore,
        metricLabel: `${Math.round(next.holdSeconds)}s hållet (${next.alignmentScore}% rak)`,
        trackerState: next,
      };
    }
    case "bent-over-row": {
      const next = advanceBentOverRowTracker(
        landmarks,
        state.trackerState as BentOverRowTrackerState,
        aspectRatio,
        timestampMs,
      );
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: next.formWarning,
        formScore: next.formWarning ? 70 : 100,
        metricLabel: `Ryggvinkel: ${Math.round(next.torsoAngle)}°`,
        trackerState: next,
      };
    }
    case "goblet-squat": {
      const next = advanceGobletSquatTracker(landmarks, state.trackerState as GobletSquatTrackerState, aspectRatio);
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: next.formWarning,
        formScore: next.formWarning ? 75 : 100,
        metricLabel: `Knävinkel: ${Math.round(next.kneeAngle)}°`,
        trackerState: next,
      };
    }
    case "pike-pushup": {
      const next = advancePikePushupTracker(landmarks, state.trackerState as PikePushupTrackerState, aspectRatio);
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: next.formWarning,
        formScore: next.isPikeV ? 100 : 70,
        metricLabel: `Djup: ${Math.round(next.elbowAngle)}°`,
        trackerState: next,
      };
    }
    case "bench-dips": {
      const next = advanceBenchDipsTracker(landmarks, state.trackerState as BenchDipsTrackerState, aspectRatio);
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: null,
        formScore: 100,
        metricLabel: `Dipp: ${Math.round(next.elbowAngle)}°`,
        trackerState: next,
      };
    }
    case "calf-raise": {
      const next = advanceCalfRaiseTracker(landmarks, state.trackerState as CalfRaiseTrackerState);
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: null,
        formScore: 100,
        metricLabel: `Lyft: ${next.liftRatio}%`,
        trackerState: next,
      };
    }
    case "bulgarian-split-squat": {
      const next = advanceBulgarianSplitSquatTracker(
        landmarks,
        state.trackerState as BulgarianSplitSquatTrackerState,
        aspectRatio,
      );
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: next.formWarning,
        formScore: next.formWarning ? 65 : 100,
        metricLabel: `Främre knä: ${Math.round(next.frontKneeAngle)}° · ${next.frontLeg ?? "sida saknas"}`,
        trackerState: next,
      };
    }
    case "dumbbell-rdl": {
      const next = advanceDumbbellRdlTracker(
        landmarks,
        state.trackerState as DumbbellRdlTrackerState,
        aspectRatio,
      );
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: next.formWarning,
        formScore: next.formWarning ? 65 : 100,
        metricLabel: `Höft ${Math.round(next.hipAngle)}° · Knä ${Math.round(next.kneeAngle)}°`,
        trackerState: next,
      };
    }
    case "pushup": {
      const next = advancePushupTracker(state.trackerState as PushupTrackerState, landmarks, timestampMs);
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: next.formMessage,
        formScore: next.isFormWarning ? 70 : 100,
        metricLabel: `Armbågsvinkel: ${Math.round(next.elbowAngle)}°`,
        trackerState: next,
      };
    }
    case "lunge": {
      const next = advanceLungeTracker(state.trackerState as LungeTrackerState, landmarks, timestampMs);
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: null,
        formScore: 100,
        metricLabel: `Knävinkel: ${Math.round(next.kneeAngle)}° (${next.leadLeg ?? "neutral"})`,
        trackerState: next,
      };
    }
    case "plank": {
      const next = advancePlankTracker(state.trackerState as PlankTrackerState, landmarks, timestampMs);
      const holdSec = Math.round(next.holdTimeMs / 1000);
      return {
        ...state,
        holdSeconds: holdSec,
        phase: next.isHolding ? "holding" : "broken",
        formWarning: next.formWarning,
        formScore: next.isHolding ? 100 : 60,
        metricLabel: `${holdSec}s planka (Linje: ${next.bodyLineDeg}°)`,
        trackerState: next,
      };
    }
    case "jumping-jacks": {
      const next = advanceJumpingJackTracker(state.trackerState as JumpingJackTrackerState, landmarks, timestampMs);
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning: null,
        formScore: 100,
        metricLabel: `${next.reps} hopp`,
        trackerState: next,
      };
    }
    case "squat": {
      const angles = measureSquatAngles(landmarks, aspectRatio);
      const next = advanceSquatTracker(state.trackerState as SquatTrackerState, angles, timestampMs);
      const kneeDeg = angles.knee !== null ? Math.round(angles.knee) : 180;
      const formWarning = next.currentRomPercent < 70 && next.phase === "bottom" ? "Sök fullt djup" : null;
      return {
        ...state,
        reps: next.reps,
        phase: next.phase,
        formWarning,
        formScore: next.currentRomPercent,
        metricLabel: `ROM ${next.currentRomPercent}% · Knä ${kneeDeg}°`,
        trackerState: next,
      };
    }
    default:
      return unsupportedExercise(exerciseId);
  }
}

export function getLibraryCameraGuidance(id: TrackableExerciseId): {
  angle: "front" | "side" | "diagonal";
  instruction: string;
  warningNotice?: string;
} {
  switch (id) {
    case "cycling":
      return {
        angle: "side",
        instruction: "Placera spinningcykeln i profil så att höft, knä och fotled på minst ett ben syns genom hela pedalvarvet.",
        warningNotice: "Första versionen uppskattar pedalvarv, kadens och aktiv tid. Den bedömer inte cykelinställning eller teknik.",
      };
    case "bicep-curl":
      return {
        angle: "front",
        instruction: "Ställ dig framifrån mot kameran med armarna fria längs sidorna.",
        warningNotice: "Håll armbågarna synliga intill kroppen.",
      };
    case "overhead-press":
      return {
        angle: "front",
        instruction: "Ställ dig framifrån med fri höjd ovanför huvudet för full lockout.",
        warningNotice: "Se till att händerna syns även när de pressas rakt upp.",
      };
    case "lateral-raise":
      return {
        angle: "front",
        instruction: "Ställ dig rakt framifrån med gott om utrymme att lyfta armarna 90° åt sidorna.",
      };
    case "bent-over-row":
      return {
        angle: "side",
        instruction: "Ställ dig 90° i profil så att ryggens fällning och armbågarnas drag syns.",
        warningNotice: "Håll rak rygg och fäll fram i höften.",
      };
    case "kettlebell-swing":
      return {
        angle: "side",
        instruction: "Ställ dig 90° i profil så att höftfällningen och knävinkeln syns tydligt.",
        warningNotice: "Kameran behöver se skillnaden mellan höftfällning och knäböj.",
      };
    case "goblet-squat":
      return {
        angle: "diagonal",
        instruction: "Ställ dig framifrån eller 45° snett med vikten hållen tätt mot bröstet.",
      };
    case "handstand-hold":
      return {
        angle: "front",
        instruction: "Placera kameran så att hela väggen/golvet syns från händer upp till taket.",
        warningNotice: "Fötterna måste synas när du är helt upp-och-ned.",
      };
    case "pike-pushup":
      return {
        angle: "side",
        instruction: "Ställ dig 90° i profil i ett inverterat V med händerna och fötterna i bild.",
      };
    case "bench-dips":
      return {
        angle: "side",
        instruction: "Ställ dig 90° i profil bredvid stolen/bänken så att armbågarna syns.",
      };
    case "calf-raise":
      return {
        angle: "front",
        instruction: "Ställ dig framifrån och se till att fötterna och hälarna syns tydligt mot golvet.",
      };
    case "bulgarian-split-squat":
      return {
        angle: "side",
        instruction: "Ställ dig i profil så att den främre foten och den upphöjda bakre foten syns samtidigt.",
        warningNotice: "Bänken eller stolen ska stå stadigt och båda fötterna måste rymmas i bild.",
      };
    case "dumbbell-rdl":
      return {
        angle: "side",
        instruction: "Ställ dig i profil så att axel, höft, knä och fot syns genom hela höftfällningen.",
        warningNotice: "Motorn mäter höft- och knävinkel, inte hantelns exakta bana.",
      };
    case "pushup":
    case "plank":
    case "lunge":
      return {
        angle: "side",
        instruction: "Vänd dig 90° åt sidan så hela kroppen syns i profil.",
      };
    case "jumping-jacks":
    case "squat":
      return {
        angle: "front",
        instruction: "Ställ dig rakt framifrån så att hela kroppen ryms i bild.",
      };
    default:
      return unsupportedExercise(id);
  }
}
