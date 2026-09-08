import { describe, expect, it } from "vitest";

import {
  getExerciseCameraGuidance,
  type ExerciseType,
} from "../motion-exercises";
import {
  advanceMultiExerciseSession,
  createMultiExerciseSession,
  DEFAULT_FULL_BODY_CIRCUIT,
  type MultiExerciseSessionState,
} from "../motion-circuit";

describe("Exercise Camera Guidance (Steg 76)", () => {
  it("provides side-angle camera guidance for pushup, plank and lunge", () => {
    const sideExercises: ExerciseType[] = ["pushup", "plank", "lunge"];

    for (const ex of sideExercises) {
      const guidance = getExerciseCameraGuidance(ex);
      expect(guidance.angle).toBe("side");
      expect(guidance.instruction).toContain("90°");
    }
  });

  it("provides front or 45-degree camera guidance for squat and jumping jacks", () => {
    const squatGuide = getExerciseCameraGuidance("squat");
    expect(squatGuide.angle).toBe("front-or-45");

    const jacksGuide = getExerciseCameraGuidance("jumping-jacks");
    expect(jacksGuide.angle).toBe("front");
  });
});

describe("Multi-Exercise Passkomposition & Circuit (Steg 77)", () => {
  it("defines default full body circuit containing 4 exercises (15-20 min)", () => {
    expect(DEFAULT_FULL_BODY_CIRCUIT.blocks.length).toBeGreaterThanOrEqual(4);
    const exercises = DEFAULT_FULL_BODY_CIRCUIT.blocks.map((b) => b.exercise);
    expect(exercises).toContain("squat");
    expect(exercises).toContain("pushup");
    expect(exercises).toContain("lunge");
    expect(exercises).toContain("plank");
  });

  it("initializes a multi-exercise circuit session in idle state", () => {
    const session = createMultiExerciseSession(DEFAULT_FULL_BODY_CIRCUIT);
    expect(session.status).toBe("idle");
    expect(session.currentBlockIndex).toBe(0);
    expect(session.currentSetInBlock).toBe(1);
    expect(session.activeExercise).toBe("squat");
  });

  it("transitions between exercises seamlessly with camera cue when block completes", () => {
    const customCircuit = {
      id: "quick-test",
      name: "Snabbtest",
      description: "2 övningar",
      blocks: [
        { exercise: "squat" as ExerciseType, targetSets: 1, targetReps: 5, restSeconds: 15 },
        { exercise: "pushup" as ExerciseType, targetSets: 1, targetReps: 5, restSeconds: 15 },
      ],
    };

    let session = createMultiExerciseSession(customCircuit);
    session = advanceMultiExerciseSession(session, {
      type: "start",
      nowMs: 1000,
    });

    expect(session.status).toBe("active");
    expect(session.activeExercise).toBe("squat");

    // Complete the squat set
    const completeSquat = advanceMultiExerciseSession(session, {
      type: "set-completed",
      completedReps: 5,
      nowMs: 20_000,
    });

    // Enters rest between exercises
    expect(completeSquat.status).toBe("resting");
    expect(completeSquat.cue?.text).toContain("Vila");

    // Advance past rest into next exercise (pushup)
    const startPushup = advanceMultiExerciseSession(completeSquat, {
      type: "tick",
      nowMs: 36_000, // 16s later (> 15s rest)
    });

    expect(startPushup.status).toBe("active");
    expect(startPushup.activeExercise).toBe("pushup");
    // Camera angle warning for side angle
    expect(startPushup.cameraGuidance?.angle).toBe("side");
    expect(startPushup.cue?.text).toContain("90°");
  });

  it("completes the circuit and marks session done after all blocks are completed", () => {
    const miniCircuit = {
      id: "mini",
      name: "Mini",
      description: "1 övning 1 set",
      blocks: [
        { exercise: "plank" as ExerciseType, targetSets: 1, targetReps: 30, restSeconds: 10, isHoldDuration: true },
      ],
    };

    let session = createMultiExerciseSession(miniCircuit);
    session = advanceMultiExerciseSession(session, { type: "start", nowMs: 1000 });
    const finished = advanceMultiExerciseSession(session, {
      type: "set-completed",
      completedReps: 30,
      nowMs: 31_000,
    });

    expect(finished.status).toBe("completed");
    expect(finished.completedBlocks.length).toBe(1);
    expect(finished.cue?.sound).toBe("workout-complete");
  });
});
