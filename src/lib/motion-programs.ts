import type { MuscleGroup, TrackableExerciseId } from "./motion-library";

export type ProgramId =
  | "push-power"
  | "pull-biceps"
  | "legs-foundation"
  | "kettlebell-blast"
  | "calisthenics-control"
  | "mini-test";

export interface ProgramExerciseItem {
  exerciseId: TrackableExerciseId;
  sets: number;
  reps: number;
  restSeconds: number;
  isHoldDuration?: boolean;
}

export interface WorkoutProgram {
  id: ProgramId;
  title: string;
  description: string;
  targetMuscleGroups: MuscleGroup[];
  estimatedMinutes: number;
  exercises: ProgramExerciseItem[];
}

export const WORKOUT_PROGRAMS: Record<ProgramId, WorkoutProgram> = {
  "push-power": {
    id: "push-power",
    title: "Push & Press (Bröst, Axlar, Triceps)",
    description: "Presspass med armhävningar, hantelpress och kontrollerade sidolyft.",
    targetMuscleGroups: ["chest", "shoulders", "triceps"],
    estimatedMinutes: 20,
    exercises: [
      { exerciseId: "pushup", sets: 3, reps: 15, restSeconds: 45 },
      { exerciseId: "overhead-press", sets: 3, reps: 10, restSeconds: 45 },
      { exerciseId: "lateral-raise", sets: 3, reps: 12, restSeconds: 30 },
    ],
  },
  "pull-biceps": {
    id: "pull-biceps",
    title: "Pull & Biceps (Rygg, Biceps & Core)",
    description: "Drag- och bakkedjepass som bygger stark hållning med hantelrodd och bicepscurls.",
    targetMuscleGroups: ["back", "biceps", "core"],
    estimatedMinutes: 18,
    exercises: [
      { exerciseId: "bent-over-row", sets: 3, reps: 12, restSeconds: 45 },
      { exerciseId: "bicep-curl", sets: 3, reps: 10, restSeconds: 40 },
      { exerciseId: "plank", sets: 3, reps: 45, restSeconds: 30, isHoldDuration: true },
    ],
  },
  "legs-foundation": {
    id: "legs-foundation",
    title: "Legs & Lower Body (Ben, Säte & Vader)",
    description: "Komplett benpass med knäböj, djupa utfall och kontrollerade vadlyft.",
    targetMuscleGroups: ["legs", "core"],
    estimatedMinutes: 20,
    exercises: [
      { exerciseId: "squat", sets: 3, reps: 15, restSeconds: 60 },
      { exerciseId: "lunge", sets: 3, reps: 10, restSeconds: 45 },
      { exerciseId: "calf-raise", sets: 3, reps: 20, restSeconds: 30 },
    ],
  },
  "kettlebell-blast": {
    id: "kettlebell-blast",
    title: "Kettlebell Conditioning Blast",
    description: "Explosivt flås och helkroppsstyrka med svingar, goblet squats och bålstabilitet.",
    targetMuscleGroups: ["full-body", "legs", "core"],
    estimatedMinutes: 15,
    exercises: [
      { exerciseId: "kettlebell-swing", sets: 4, reps: 20, restSeconds: 40 },
      { exerciseId: "goblet-squat", sets: 3, reps: 12, restSeconds: 45 },
      { exerciseId: "plank", sets: 3, reps: 40, restSeconds: 30, isHoldDuration: true },
    ],
  },
  "calisthenics-control": {
    id: "calisthenics-control",
    title: "Calisthenics & Handstand Control",
    description: "Kroppskontroll och gymnastikstyrka: pik-armhävningar, handstående och planka.",
    targetMuscleGroups: ["shoulders", "triceps", "core"],
    estimatedMinutes: 22,
    exercises: [
      { exerciseId: "pike-pushup", sets: 3, reps: 8, restSeconds: 45 },
      { exerciseId: "handstand-hold", sets: 3, reps: 20, restSeconds: 60, isHoldDuration: true },
      { exerciseId: "plank", sets: 3, reps: 45, restSeconds: 30, isHoldDuration: true },
    ],
  },
  "mini-test": {
    id: "mini-test",
    title: "Snabbtest",
    description: "Ett set för test.",
    targetMuscleGroups: ["biceps"],
    estimatedMinutes: 2,
    exercises: [{ exerciseId: "bicep-curl", sets: 1, reps: 10, restSeconds: 30 }],
  },
};

export function getWorkoutProgram(id: ProgramId): WorkoutProgram {
  return WORKOUT_PROGRAMS[id];
}

// ---------------------------------------------------------------------------
// Program Session State Machine
// ---------------------------------------------------------------------------

export type ProgramSessionPhase = "active-set" | "resting" | "completed";

export interface CompletedSetRecord {
  exerciseId: TrackableExerciseId;
  setNumber: number;
  repsAchieved: number;
  rpe?: number;
  completedAt: string;
}

export interface ProgramSessionState {
  programId: ProgramId;
  currentExerciseIndex: number;
  currentSet: number;
  phase: ProgramSessionPhase;
  activeExercise: ProgramExerciseItem;
  restSecondsRemaining: number;
  completedSets: CompletedSetRecord[];
}

export function createProgramSession(program: WorkoutProgram): ProgramSessionState {
  const activeExercise = program.exercises[0];
  return {
    programId: program.id,
    currentExerciseIndex: 0,
    currentSet: 1,
    phase: "active-set",
    activeExercise,
    restSecondsRemaining: 0,
    completedSets: [],
  };
}

export function completeProgramSet(
  session: ProgramSessionState,
  actualReps: number,
  rpe?: number,
): ProgramSessionState {
  const currentEx = session.activeExercise;
  const newCompletedSets = [
    ...session.completedSets,
    {
      exerciseId: currentEx.exerciseId,
      setNumber: session.currentSet,
      repsAchieved: actualReps,
      rpe,
      completedAt: new Date().toISOString(),
    },
  ];

  const program = WORKOUT_PROGRAMS[session.programId];
  const isLastSetOfExercise = session.currentSet >= currentEx.sets;
  const isLastExercise = session.currentExerciseIndex >= (program ? program.exercises.length - 1 : 0);

  if (isLastSetOfExercise && isLastExercise) {
    return {
      ...session,
      phase: "completed",
      completedSets: newCompletedSets,
      restSecondsRemaining: 0,
    };
  }

  return {
    ...session,
    phase: "resting",
    restSecondsRemaining: currentEx.restSeconds,
    completedSets: newCompletedSets,
  };
}

export function tickProgramRest(
  session: ProgramSessionState,
  deltaSeconds: number,
): ProgramSessionState {
  if (session.phase !== "resting") return session;

  const remaining = Math.max(0, session.restSecondsRemaining - deltaSeconds);
  if (remaining === 0) {
    return advanceToNextSetOrExercise(session);
  }

  return {
    ...session,
    restSecondsRemaining: remaining,
  };
}

export function skipProgramRest(session: ProgramSessionState): ProgramSessionState {
  if (session.phase !== "resting") return session;
  return advanceToNextSetOrExercise(session);
}

function advanceToNextSetOrExercise(session: ProgramSessionState): ProgramSessionState {
  const program = WORKOUT_PROGRAMS[session.programId];
  const currentEx = session.activeExercise;

  if (session.currentSet < currentEx.sets) {
    return {
      ...session,
      currentSet: session.currentSet + 1,
      phase: "active-set",
      restSecondsRemaining: 0,
    };
  }

  // Move to next exercise
  const nextExIndex = session.currentExerciseIndex + 1;
  if (!program || nextExIndex >= program.exercises.length) {
    return {
      ...session,
      phase: "completed",
      restSecondsRemaining: 0,
    };
  }

  return {
    ...session,
    currentExerciseIndex: nextExIndex,
    currentSet: 1,
    activeExercise: program.exercises[nextExIndex],
    phase: "active-set",
    restSecondsRemaining: 0,
  };
}

export interface ProgramSummary {
  totalSets: number;
  totalReps: number;
  xpEarned: number;
  isFullyCompleted: boolean;
  exercisesCompletedCount: number;
}

export function generateProgramSummary(
  session: ProgramSessionState,
  program: WorkoutProgram,
): ProgramSummary {
  const totalSets = session.completedSets.length;
  const totalReps = session.completedSets.reduce((sum, s) => sum + s.repsAchieved, 0);
  const distinctExercises = new Set(session.completedSets.map((s) => s.exerciseId)).size;
  const totalPlannedSets = program.exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const isFullyCompleted = totalSets >= totalPlannedSets;

  // XP calculation: 20 XP per completed set + 100 XP completion bonus + 1 XP per rep
  const xpEarned = totalSets * 20 + totalReps + (isFullyCompleted ? 100 : 0);

  return {
    totalSets,
    totalReps,
    xpEarned,
    isFullyCompleted,
    exercisesCompletedCount: distinctExercises,
  };
}
