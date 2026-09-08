import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKOUT_PROGRAMS,
  getWorkoutProgram,
  createProgramSession,
  completeProgramSet,
  tickProgramRest,
  skipProgramRest,
  generateProgramSummary,
  saveProgramSessionSnapshot,
  loadProgramSessionSnapshot,
  clearProgramSessionSnapshot,
  type ProgramId,
} from "../motion-programs";

describe("motion-programs: Program Catalog & Structure", () => {
  it("contains all standard muscle split and conditioning programs", () => {
    const expectedPrograms: ProgramId[] = [
      "push-power",
      "pull-biceps",
      "legs-foundation",
      "kettlebell-blast",
      "calisthenics-control",
    ];

    for (const id of expectedPrograms) {
      const prog = getWorkoutProgram(id);
      expect(prog).toBeDefined();
      expect(prog.id).toBe(id);
      expect(prog.title.length).toBeGreaterThan(3);
      expect(prog.exercises.length).toBeGreaterThanOrEqual(3);
      expect(prog.targetMuscleGroups.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("defines realistic sets, reps and rest periods per exercise in programs", () => {
    const pushProg = getWorkoutProgram("push-power");
    for (const ex of pushProg.exercises) {
      expect(ex.sets).toBeGreaterThanOrEqual(1);
      expect(ex.reps).toBeGreaterThanOrEqual(5);
      expect(ex.restSeconds).toBeGreaterThanOrEqual(15);
      expect(ex.exerciseId).toBeDefined();
    }
  });

  it("does not prescribe dip variations in standard programs", () => {
    const prescribedExerciseIds = Object.values(WORKOUT_PROGRAMS)
      .filter((program) => program.id !== "mini-test")
      .flatMap((program) => program.exercises.map((exercise) => exercise.exerciseId));

    expect(prescribedExerciseIds).not.toContain("bench-dips");
    expect(prescribedExerciseIds).not.toContain("parallel-bar-dips");
  });
});

describe("motion-programs: Program Execution State Machine", () => {
  it("initializes a program session at exercise 0, set 1 in active-set phase", () => {
    const prog = getWorkoutProgram("kettlebell-blast");
    const session = createProgramSession(prog);

    expect(session.programId).toBe("kettlebell-blast");
    expect(session.currentExerciseIndex).toBe(0);
    expect(session.currentSet).toBe(1);
    expect(session.phase).toBe("active-set");
    expect(session.activeExercise.exerciseId).toBe(prog.exercises[0].exerciseId);
  });

  it("transitions to rest phase upon completing a set and skips rest cleanly", () => {
    const prog = getWorkoutProgram("kettlebell-blast");
    let session = createProgramSession(prog);

    // Complete set 1
    session = completeProgramSet(session, 20, 2); // 20 reps, RPE 2 (lagom)
    expect(session.phase).toBe("resting");
    expect(session.restSecondsRemaining).toBeGreaterThan(0);
    expect(session.completedSets.length).toBe(1);

    // Tick rest
    session = tickProgramRest(session, 5);
    expect(session.restSecondsRemaining).toBe(prog.exercises[0].restSeconds - 5);

    // Skip rest
    session = skipProgramRest(session);
    expect(session.phase).toBe("active-set");
    expect(session.currentSet).toBe(2);
  });

  it("transitions between exercises when all sets for an exercise are completed", () => {
    const prog = getWorkoutProgram("pull-biceps");
    let session = createProgramSession(prog);
    const firstEx = prog.exercises[0];

    // Complete all sets for first exercise
    for (let s = 1; s <= firstEx.sets; s++) {
      session = completeProgramSet(session, 10, 2);
      session = skipProgramRest(session);
    }

    // Now should be on exercise 1, set 1
    expect(session.currentExerciseIndex).toBe(1);
    expect(session.currentSet).toBe(1);
    expect(session.activeExercise.exerciseId).toBe(prog.exercises[1].exerciseId);
  });

  it("marks program completed and generates structured summary when final set is done", () => {
    // Create a short custom/test-friendly session with 1 exercise, 1 set
    const miniProg = {
      id: "mini-test" as ProgramId,
      title: "Snabbtest",
      description: "Ett set för test.",
      targetMuscleGroups: ["biceps" as const],
      estimatedMinutes: 2,
      exercises: [
        { exerciseId: "bicep-curl" as const, sets: 1, reps: 10, restSeconds: 30 },
      ],
    };

    let session = createProgramSession(miniProg);
    session = completeProgramSet(session, 12, 1);

    expect(session.phase).toBe("completed");
    const summary = generateProgramSummary(session, miniProg);
    expect(summary.totalSets).toBe(1);
    expect(summary.totalReps).toBe(12);
    expect(summary.xpEarned).toBeGreaterThanOrEqual(50);
    expect(summary.isFullyCompleted).toBe(true);
  });
});

describe("motion-programs: Program Session Memory & Persistence", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const key in mockStorage) delete mockStorage[key];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves and loads an in-progress program session", () => {
    const prog = getWorkoutProgram("push-power");
    let session = createProgramSession(prog);
    // Complete all 3 sets of pushups
    for (let i = 0; i < 3; i++) {
      session = completeProgramSet(session, 15);
      session = skipProgramRest(session);
    }
    // Now on exercise 1 (overhead-press)
    expect(session.currentExerciseIndex).toBe(1);

    saveProgramSessionSnapshot(session);
    const loaded = loadProgramSessionSnapshot();
    expect(loaded).toBeDefined();
    expect(loaded?.programId).toBe("push-power");
    expect(loaded?.currentExerciseIndex).toBe(1);
    expect(loaded?.completedSets.length).toBe(3);

    clearProgramSessionSnapshot();
    expect(loadProgramSessionSnapshot()).toBeNull();
  });
});

