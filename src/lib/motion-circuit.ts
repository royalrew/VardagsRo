import {
  getExerciseCameraGuidance,
  getExerciseProfile,
  type ExerciseCameraGuidance,
  type ExerciseType,
} from "./motion-exercises";

export interface MultiExerciseBlock {
  exercise: ExerciseType;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  isHoldDuration?: boolean;
}

export interface MultiExerciseRoutine {
  id: string;
  name: string;
  description: string;
  blocks: readonly MultiExerciseBlock[];
}

export interface CompletedBlockSummary {
  exercise: ExerciseType;
  totalSets: number;
  totalRepsOrSeconds: number;
  completedAtMs: number;
}

export type MultiExerciseSessionStatus = "idle" | "active" | "resting" | "completed";

export interface MultiExerciseSessionCue {
  text: string;
  sound?: "set-complete" | "workout-complete" | "rest-end";
}

export interface MultiExerciseSessionState {
  routine: MultiExerciseRoutine;
  status: MultiExerciseSessionStatus;
  currentBlockIndex: number;
  currentSetInBlock: number;
  activeExercise: ExerciseType;
  cameraGuidance: ExerciseCameraGuidance | null;
  restStartedAtMs: number | null;
  restDurationSeconds: number;
  completedBlocks: readonly CompletedBlockSummary[];
  startedAtMs: number | null;
  completedAtMs: number | null;
  cue?: MultiExerciseSessionCue;
}

export type MultiExerciseEvent =
  | { type: "start"; nowMs: number }
  | { type: "set-completed"; completedReps: number; nowMs: number }
  | { type: "skip-rest"; nowMs: number }
  | { type: "tick"; nowMs: number };

/**
 * Standard 15-20 min full body circuit covering lower, upper, core and stability.
 */
export const DEFAULT_FULL_BODY_CIRCUIT: MultiExerciseRoutine = {
  id: "full-body-15m",
  name: "15 min Helkropp",
  description: "Balanserat 4-stegs pass med Knäböj, Armhävningar, Utfall och Planka.",
  blocks: [
    { exercise: "squat", targetSets: 3, targetReps: 10, restSeconds: 45 },
    { exercise: "pushup", targetSets: 3, targetReps: 8, restSeconds: 45 },
    { exercise: "lunge", targetSets: 3, targetReps: 10, restSeconds: 45 },
    { exercise: "plank", targetSets: 3, targetReps: 30, restSeconds: 45, isHoldDuration: true },
  ],
};

/**
 * Creates an initial multi-exercise circuit state.
 *
 * @param routine - Multi-exercise routine configuration.
 * @returns Initialized MultiExerciseSessionState.
 */
export function createMultiExerciseSession(
  routine: MultiExerciseRoutine = DEFAULT_FULL_BODY_CIRCUIT,
): MultiExerciseSessionState {
  const initialBlock = routine.blocks[0] ?? {
    exercise: "squat",
    targetSets: 1,
    targetReps: 10,
    restSeconds: 30,
  };

  return {
    routine,
    status: "idle",
    currentBlockIndex: 0,
    currentSetInBlock: 1,
    activeExercise: initialBlock.exercise,
    cameraGuidance: getExerciseCameraGuidance(initialBlock.exercise),
    restStartedAtMs: null,
    restDurationSeconds: initialBlock.restSeconds,
    completedBlocks: [],
    startedAtMs: null,
    completedAtMs: null,
  };
}

/**
 * Advances the multi-exercise circuit state machine on workout events.
 *
 * @param state - Current MultiExerciseSessionState.
 * @param event - MultiExerciseEvent to apply.
 * @returns Updated MultiExerciseSessionState.
 */
export function advanceMultiExerciseSession(
  state: MultiExerciseSessionState,
  event: MultiExerciseEvent,
): MultiExerciseSessionState {
  if (state.status === "completed" && event.type !== "start") {
    return state;
  }

  const currentBlock = state.routine.blocks[state.currentBlockIndex];
  if (!currentBlock) {
    return {
      ...state,
      status: "completed",
      completedAtMs: event.nowMs,
    };
  }

  if (event.type === "start") {
    const guidance = getExerciseCameraGuidance(currentBlock.exercise);
    const profile = getExerciseProfile(currentBlock.exercise);
    return {
      ...state,
      status: "active",
      startedAtMs: event.nowMs,
      cameraGuidance: guidance,
      cue: {
        text: `Dags för ${profile.name}! ${guidance.instruction}`,
      },
    };
  }

  if (event.type === "tick") {
    if (state.status !== "resting" || state.restStartedAtMs === null) {
      return state;
    }

    const elapsedSeconds = (event.nowMs - state.restStartedAtMs) / 1000;
    if (elapsedSeconds < state.restDurationSeconds) {
      return state;
    }

    // Rest time expired -> start next set or next exercise
    return transitionToNextWork(state, event.nowMs);
  }

  if (event.type === "skip-rest") {
    if (state.status !== "resting") return state;
    return transitionToNextWork(state, event.nowMs);
  }

  if (event.type === "set-completed") {
    const isBlockDone = state.currentSetInBlock >= currentBlock.targetSets;
    const isCircuitDone = isBlockDone && state.currentBlockIndex >= state.routine.blocks.length - 1;

    if (isCircuitDone) {
      const summary: CompletedBlockSummary = {
        exercise: currentBlock.exercise,
        totalSets: state.currentSetInBlock,
        totalRepsOrSeconds: event.completedReps * state.currentSetInBlock,
        completedAtMs: event.nowMs,
      };

      return {
        ...state,
        status: "completed",
        completedAtMs: event.nowMs,
        completedBlocks: [...state.completedBlocks, summary],
        cue: {
          text: "Grymt kört! Hela passet är slutfört!",
          sound: "workout-complete",
        },
      };
    }

    // Set finished -> enter rest
    return {
      ...state,
      status: "resting",
      restStartedAtMs: event.nowMs,
      restDurationSeconds: currentBlock.restSeconds,
      cue: {
        text: `Bra set! Vila i ${currentBlock.restSeconds} sekunder.`,
        sound: "set-complete",
      },
    };
  }

  return state;
}

/**
 * Transitions from rest to the next set or next exercise block.
 */
function transitionToNextWork(
  state: MultiExerciseSessionState,
  nowMs: number,
): MultiExerciseSessionState {
  const currentBlock = state.routine.blocks[state.currentBlockIndex];
  if (!currentBlock) return state;

  const isBlockDone = state.currentSetInBlock >= currentBlock.targetSets;

  if (!isBlockDone) {
    // Next set of same exercise
    return {
      ...state,
      status: "active",
      currentSetInBlock: state.currentSetInBlock + 1,
      restStartedAtMs: null,
      cue: {
        text: `Set ${state.currentSetInBlock + 1} av ${currentBlock.targetSets}! Kör!`,
        sound: "rest-end",
      },
    };
  }

  // Next exercise block
  const nextBlockIndex = state.currentBlockIndex + 1;
  const nextBlock = state.routine.blocks[nextBlockIndex];

  if (!nextBlock) {
    return {
      ...state,
      status: "completed",
      completedAtMs: nowMs,
      cue: {
        text: "Passet är klart!",
        sound: "workout-complete",
      },
    };
  }

  const guidance = getExerciseCameraGuidance(nextBlock.exercise);
  const profile = getExerciseProfile(nextBlock.exercise);
  const prevSummary: CompletedBlockSummary = {
    exercise: currentBlock.exercise,
    totalSets: currentBlock.targetSets,
    totalRepsOrSeconds: currentBlock.targetReps * currentBlock.targetSets,
    completedAtMs: nowMs,
  };

  return {
    ...state,
    status: "active",
    currentBlockIndex: nextBlockIndex,
    currentSetInBlock: 1,
    activeExercise: nextBlock.exercise,
    cameraGuidance: guidance,
    restStartedAtMs: null,
    restDurationSeconds: nextBlock.restSeconds,
    completedBlocks: [...state.completedBlocks, prevSummary],
    cue: {
      text: `Nu byter vi till ${profile.name}! ${guidance.instruction}`,
      sound: "rest-end",
    },
  };
}
