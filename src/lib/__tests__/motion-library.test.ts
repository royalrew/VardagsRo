import { describe, expect, it } from "vitest";
import {
  getLibraryExercise,
  filterExercisesByEquipment,
  filterExercisesByMuscle,
  createBicepCurlTracker,
  advanceBicepCurlTracker,
  createOverheadPressTracker,
  advanceOverheadPressTracker,
  createLateralRaiseTracker,
  advanceLateralRaiseTracker,
  createKettlebellSwingTracker,
  advanceKettlebellSwingTracker,
  createHandstandTracker,
  advanceHandstandTracker,
  createBentOverRowTracker,
  advanceBentOverRowTracker,
  createGobletSquatTracker,
  advanceGobletSquatTracker,
  createPikePushupTracker,
  advancePikePushupTracker,
  createBenchDipsTracker,
  advanceBenchDipsTracker,
  createCalfRaiseTracker,
  advanceCalfRaiseTracker,
  createBulgarianSplitSquatTracker,
  advanceBulgarianSplitSquatTracker,
  createDumbbellRdlTracker,
  advanceDumbbellRdlTracker,
  createUnifiedExerciseTracker,
  advanceUnifiedExerciseTracker,
  isTrackableExerciseId,
  PLANNED_EXERCISE_IDS,
  TRACKABLE_EXERCISE_IDS,
  type LibraryExerciseId,
  type TrackableExerciseId,
} from "../motion-library";
import type { MotionLandmark } from "../motion-engine";

function createMockLandmark(x: number, y: number, z = 0, visibility = 1): MotionLandmark {
  return { x, y, z, visibility };
}

function createBaseBodyLandmarks(): MotionLandmark[] {
  const lm: MotionLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    lm.push(createMockLandmark(0.5, 0.5));
  }
  // Standard standing human
  lm[0] = createMockLandmark(0.5, 0.15); // Nose / head
  lm[11] = createMockLandmark(0.42, 0.28); // Left shoulder
  lm[12] = createMockLandmark(0.58, 0.28); // Right shoulder
  lm[13] = createMockLandmark(0.40, 0.45); // Left elbow
  lm[14] = createMockLandmark(0.60, 0.45); // Right elbow
  lm[15] = createMockLandmark(0.40, 0.65); // Left wrist
  lm[16] = createMockLandmark(0.60, 0.65); // Right wrist
  lm[23] = createMockLandmark(0.45, 0.55); // Left hip
  lm[24] = createMockLandmark(0.55, 0.55); // Right hip
  lm[25] = createMockLandmark(0.45, 0.75); // Left knee
  lm[26] = createMockLandmark(0.55, 0.75); // Right knee
  lm[27] = createMockLandmark(0.45, 0.95); // Left ankle
  lm[28] = createMockLandmark(0.55, 0.95); // Right ankle
  lm[31] = createMockLandmark(0.45, 0.98); // Left toe
  lm[32] = createMockLandmark(0.55, 0.98); // Right toe
  return lm;
}

describe("motion-library: Exercise Catalog & Taxonomy", () => {
  it("contains all required exercises across bodyweight, dumbbells, kettlebells and gymnastics", () => {
    const expectedIds: LibraryExerciseId[] = [
      "squat",
      "lunge",
      "pushup",
      "jumping-jacks",
      "plank",
      "bicep-curl",
      "overhead-press",
      "lateral-raise",
      "bent-over-row",
      "kettlebell-swing",
      "goblet-squat",
      "handstand-hold",
      "pike-pushup",
      "bench-dips",
      "calf-raise",
      "cycling",
    ];

    for (const id of expectedIds) {
      const ex = getLibraryExercise(id);
      expect(ex).toBeDefined();
      expect(ex.id).toBe(id);
      expect(ex.name.length).toBeGreaterThan(2);
      expect(ex.cues.start).toBeDefined();
      expect(ex.primaryMuscle).toBeDefined();
    }
  });

  it("filters exercises correctly by equipment category", () => {
    const dumbbells = filterExercisesByEquipment("dumbbell");
    expect(dumbbells.map((e) => e.id)).toEqual(
      expect.arrayContaining(["bicep-curl", "overhead-press", "lateral-raise", "bent-over-row"]),
    );

    const kettlebells = filterExercisesByEquipment("kettlebell");
    expect(kettlebells.map((e) => e.id)).toEqual(
      expect.arrayContaining(["kettlebell-swing", "goblet-squat"]),
    );

    const bodyweight = filterExercisesByEquipment("bodyweight");
    expect(bodyweight.map((e) => e.id)).toEqual(
      expect.arrayContaining(["pushup", "squat", "handstand-hold", "plank"]),
    );
  });

  it("filters exercises by targeted muscle groups", () => {
    const shoulderExercises = filterExercisesByMuscle("shoulders");
    expect(shoulderExercises.map((e) => e.id)).toEqual(
      expect.arrayContaining(["overhead-press", "lateral-raise", "pike-pushup"]),
    );
  });

  it("keeps planned exercises out of the verified tracker set", () => {
    expect(TRACKABLE_EXERCISE_IDS).toHaveLength(18);
    expect(PLANNED_EXERCISE_IDS).toHaveLength(5);
    expect(isTrackableExerciseId("bench-dips")).toBe(true);
    expect(isTrackableExerciseId("parallel-bar-dips")).toBe(false);
    expect(isTrackableExerciseId("bulgarian-split-squat")).toBe(true);
    expect(isTrackableExerciseId("dumbbell-rdl")).toBe(true);
    expect(() =>
      createUnifiedExerciseTracker("parallel-bar-dips" as TrackableExerciseId),
    ).toThrow(/saknar en verifierad tracker/);
  });
});

describe("motion-library: Dumbbell Bicep Curl Tracker", () => {
  it("tracks a full bicep curl repetition through extended -> flexing -> contracted -> extended", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Bottom extended: elbow straight (~160 deg)
    lm[13] = createMockLandmark(0.40, 0.45);
    lm[15] = createMockLandmark(0.40, 0.65);
    state = advanceBicepCurlTracker(lm, state);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(0);

    // 2. Flexing: wrist moving up, elbow angle ~90 deg
    lm[15] = createMockLandmark(0.40, 0.45);
    state = advanceBicepCurlTracker(lm, state);
    expect(state.phase === "flexing" || state.phase === "extended").toBe(true);

    // 3. Peak contraction: elbow bent tightly (< 55 deg)
    lm[15] = createMockLandmark(0.40, 0.32);
    state = advanceBicepCurlTracker(lm, state);
    expect(state.phase).toBe("contracted");

    // 4. Return down: extended again (> 140 deg)
    lm[15] = createMockLandmark(0.40, 0.65);
    state = advanceBicepCurlTracker(lm, state);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
  });

  it("tracks a diagonal stance bicep curl accurately using 3D coordinates", () => {
    let state = createBicepCurlTracker();
    const lm = createBaseBodyLandmarks();

    // In a diagonal 45° stance, forearm curls forward along the z-axis (towards camera, z = -0.25)
    // 1. Bottom extended
    lm[11] = createMockLandmark(0.40, 0.25, 0.0);
    lm[13] = createMockLandmark(0.40, 0.45, 0.0);
    lm[15] = createMockLandmark(0.40, 0.65, 0.0);
    state = advanceBicepCurlTracker(lm, state);
    expect(state.phase).toBe("extended");

    // 2. Peak contraction with depth forward
    lm[15] = createMockLandmark(0.40, 0.30, -0.10);
    state = advanceBicepCurlTracker(lm, state);
    expect(state.phase).toBe("contracted");

    // 3. Extended back down
    lm[15] = createMockLandmark(0.40, 0.65, 0.0);
    state = advanceBicepCurlTracker(lm, state);
    expect(state.phase).toBe("extended");
    expect(state.reps).toBe(1);
  });
});

describe("motion-library: Dumbbell Overhead Shoulder Press", () => {
  it("tracks pressing dumbells overhead to full lockout", () => {
    let state = createOverheadPressTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Rack position at shoulder/ear level: elbows bent, wrists near shoulders
    lm[13] = createMockLandmark(0.35, 0.38);
    lm[14] = createMockLandmark(0.65, 0.38);
    lm[15] = createMockLandmark(0.35, 0.28);
    lm[16] = createMockLandmark(0.65, 0.28);
    state = advanceOverheadPressTracker(lm, state);
    expect(state.phase).toBe("rack");

    // 2. Pressing upwards
    lm[15] = createMockLandmark(0.38, 0.20);
    lm[16] = createMockLandmark(0.62, 0.20);
    state = advanceOverheadPressTracker(lm, state);

    // 3. Full overhead lockout: hands above head, arms fully extended
    lm[13] = createMockLandmark(0.40, 0.18);
    lm[14] = createMockLandmark(0.60, 0.18);
    lm[15] = createMockLandmark(0.41, 0.08);
    lm[16] = createMockLandmark(0.59, 0.08);
    state = advanceOverheadPressTracker(lm, state);
    expect(state.phase).toBe("lockout");

    // 4. Lower back down to rack
    lm[15] = createMockLandmark(0.35, 0.28);
    lm[16] = createMockLandmark(0.65, 0.28);
    state = advanceOverheadPressTracker(lm, state);
    expect(state.phase).toBe("rack");
    expect(state.reps).toBe(1);
  });

  it("tracks 5 reps of continuous single-arm right dumbbell presses with ear/chin rack depth", () => {
    let state = createOverheadPressTracker();
    let time = 1000;

    for (let rep = 1; rep <= 5; rep++) {
      const lm = createBaseBodyLandmarks();
      // Left arm stays bent at shoulder rack (angle ~90 deg)
      lm[13] = createMockLandmark(0.35, 0.38);
      lm[15] = createMockLandmark(0.35, 0.28);

      // Right arm at ear rack (angle ~125 deg)
      lm[14] = createMockLandmark(0.65, 0.38);
      lm[16] = createMockLandmark(0.65, 0.26);
      time += 400;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      // Right arm locks out overhead (angle ~160 deg)
      lm[14] = createMockLandmark(0.60, 0.18);
      lm[16] = createMockLandmark(0.59, 0.08);
      time += 800;
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.phase).toBe("lockout");
      expect(state.activeArm).toBe("right");

      // Right arm lowers back down to ear rack (angle ~127 deg)
      lm[14] = createMockLandmark(0.65, 0.38);
      lm[16] = createMockLandmark(0.65, 0.26);
      time += 800;
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.phase).toBe("rack");
      expect(state.reps).toBe(rep);
      expect(state.repsHistory[rep - 1]?.arm).toBe("right");
    }

    expect(state.reps).toBe(5);
  });

  it("tracks 5 reps of continuous single-arm left dumbbell presses", () => {
    let state = createOverheadPressTracker();
    let time = 1000;

    for (let rep = 1; rep <= 5; rep++) {
      const lm = createBaseBodyLandmarks();
      // Right arm stays bent at shoulder rack (angle ~90 deg)
      lm[14] = createMockLandmark(0.65, 0.38);
      lm[16] = createMockLandmark(0.65, 0.28);

      // Left arm at ear rack (angle ~125 deg)
      lm[13] = createMockLandmark(0.35, 0.38);
      lm[15] = createMockLandmark(0.35, 0.26);
      time += 400;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      // Left arm locks out overhead (angle ~165 deg)
      lm[13] = createMockLandmark(0.40, 0.18);
      lm[15] = createMockLandmark(0.41, 0.08);
      time += 800;
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.phase).toBe("lockout");
      expect(state.activeArm).toBe("left");

      // Left arm lowers back down to ear rack (angle ~125 deg)
      lm[13] = createMockLandmark(0.35, 0.38);
      lm[15] = createMockLandmark(0.35, 0.26);
      time += 800;
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.phase).toBe("rack");
      expect(state.reps).toBe(rep);
      expect(state.repsHistory[rep - 1]?.arm).toBe("left");
    }

    expect(state.reps).toBe(5);
  });

  it("tracks 5 reps of kettlebell / 2-arm presses and achieves 15 total reps in combined session", () => {
    let state = createOverheadPressTracker();
    let time = 1000;

    // 1. Five right arm reps
    for (let i = 0; i < 5; i++) {
      const lm = createBaseBodyLandmarks();
      lm[13] = createMockLandmark(0.35, 0.38);
      lm[15] = createMockLandmark(0.35, 0.28);
      lm[14] = createMockLandmark(0.65, 0.38);
      lm[16] = createMockLandmark(0.65, 0.26);
      time += 300;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      lm[14] = createMockLandmark(0.60, 0.18);
      lm[16] = createMockLandmark(0.59, 0.08);
      time += 700;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      lm[14] = createMockLandmark(0.65, 0.38);
      lm[16] = createMockLandmark(0.65, 0.26);
      time += 700;
      state = advanceOverheadPressTracker(lm, state, 1, time);
    }
    expect(state.reps).toBe(5);

    // 2. Five left arm reps
    for (let i = 0; i < 5; i++) {
      const lm = createBaseBodyLandmarks();
      lm[14] = createMockLandmark(0.65, 0.38);
      lm[16] = createMockLandmark(0.65, 0.28);
      lm[13] = createMockLandmark(0.35, 0.38);
      lm[15] = createMockLandmark(0.35, 0.26);
      time += 300;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      lm[13] = createMockLandmark(0.40, 0.18);
      lm[15] = createMockLandmark(0.41, 0.08);
      time += 700;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      lm[13] = createMockLandmark(0.35, 0.38);
      lm[15] = createMockLandmark(0.35, 0.26);
      time += 700;
      state = advanceOverheadPressTracker(lm, state, 1, time);
    }
    expect(state.reps).toBe(10);

    // 3. Five kettlebell / both arms presses from chest
    for (let i = 0; i < 5; i++) {
      const lm = createBaseBodyLandmarks();
      // Hands together at chest level
      lm[13] = createMockLandmark(0.40, 0.40);
      lm[14] = createMockLandmark(0.60, 0.40);
      lm[15] = createMockLandmark(0.48, 0.32);
      lm[16] = createMockLandmark(0.52, 0.32);
      time += 300;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      // Lockout overhead
      lm[13] = createMockLandmark(0.42, 0.18);
      lm[14] = createMockLandmark(0.58, 0.18);
      lm[15] = createMockLandmark(0.46, 0.08);
      lm[16] = createMockLandmark(0.54, 0.08);
      time += 700;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      // Return to chest
      lm[13] = createMockLandmark(0.40, 0.40);
      lm[14] = createMockLandmark(0.60, 0.40);
      lm[15] = createMockLandmark(0.48, 0.32);
      lm[16] = createMockLandmark(0.52, 0.32);
      time += 700;
      state = advanceOverheadPressTracker(lm, state, 1, time);
    }
    expect(state.reps).toBe(15);
    expect(state.repsHistory.filter((r) => r.arm === "right").length).toBe(5);
    expect(state.repsHistory.filter((r) => r.arm === "left").length).toBe(5);
    expect(state.repsHistory.filter((r) => r.arm === "both").length).toBe(5);
  });

  it("does not count false reps when resting kettlebell against the chest between reps", () => {
    let state = createOverheadPressTracker();
    let time = 1000;

    const lm = createBaseBodyLandmarks();

    // 1. Perform 1 legitimate kettlebell press to lockout
    // Rack at chest
    lm[13] = createMockLandmark(0.40, 0.40);
    lm[14] = createMockLandmark(0.60, 0.40);
    lm[15] = createMockLandmark(0.48, 0.32);
    lm[16] = createMockLandmark(0.52, 0.32);
    time += 500;
    state = advanceOverheadPressTracker(lm, state, 1, time);

    // Lockout overhead
    lm[13] = createMockLandmark(0.42, 0.18);
    lm[14] = createMockLandmark(0.58, 0.18);
    lm[15] = createMockLandmark(0.46, 0.08);
    lm[16] = createMockLandmark(0.54, 0.08);
    time += 800;
    state = advanceOverheadPressTracker(lm, state, 1, time);
    expect(state.phase).toBe("lockout");

    // Lower back to chest
    lm[13] = createMockLandmark(0.40, 0.40);
    lm[14] = createMockLandmark(0.60, 0.40);
    lm[15] = createMockLandmark(0.48, 0.32);
    lm[16] = createMockLandmark(0.52, 0.32);
    time += 800;
    state = advanceOverheadPressTracker(lm, state, 1, time);
    expect(state.phase).toBe("rack");
    expect(state.reps).toBe(1);

    // 2. User rests against chest for multiple seconds, shifting arms and body
    // Even if elbows straighten slightly or hands adjust around chest height
    for (let t = 0; t < 10; t++) {
      time += 300;
      // Hands resting on chest, elbows down
      lm[13] = createMockLandmark(0.40, 0.42);
      lm[14] = createMockLandmark(0.60, 0.42);
      lm[15] = createMockLandmark(0.47, 0.30);
      lm[16] = createMockLandmark(0.53, 0.30);
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.reps).toBe(1);
      expect(state.phase).toBe("rack");
    }

    // 3. User performs second legitimate rep
    lm[13] = createMockLandmark(0.42, 0.18);
    lm[14] = createMockLandmark(0.58, 0.18);
    lm[15] = createMockLandmark(0.46, 0.08);
    lm[16] = createMockLandmark(0.54, 0.08);
    time += 800;
    state = advanceOverheadPressTracker(lm, state, 1, time);
    expect(state.phase).toBe("lockout");

    lm[13] = createMockLandmark(0.40, 0.40);
    lm[14] = createMockLandmark(0.60, 0.40);
    lm[15] = createMockLandmark(0.48, 0.32);
    lm[16] = createMockLandmark(0.52, 0.32);
    time += 800;
    state = advanceOverheadPressTracker(lm, state, 1, time);
    expect(state.reps).toBe(2);
  });

  it("does not multi-count kettlebell reps during overhead flutter/tremble", () => {
    let state = createOverheadPressTracker();
    let time = 1000;

    for (let rep = 1; rep <= 5; rep++) {
      const lm = createBaseBodyLandmarks();

      // 1. Hands at chest
      lm[13] = createMockLandmark(0.40, 0.40);
      lm[14] = createMockLandmark(0.60, 0.40);
      lm[15] = createMockLandmark(0.48, 0.32);
      lm[16] = createMockLandmark(0.52, 0.32);
      time += 400;
      state = advanceOverheadPressTracker(lm, state, 1, time);

      // 2. Lockout overhead
      lm[13] = createMockLandmark(0.42, 0.18);
      lm[14] = createMockLandmark(0.58, 0.18);
      lm[15] = createMockLandmark(0.46, 0.08);
      lm[16] = createMockLandmark(0.54, 0.08);
      time += 700;
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.phase).toBe("lockout");

      // 3. Flutter in the air (hands still up, elbows wobble slightly to ~136 deg)
      lm[13] = createMockLandmark(0.38, 0.22);
      lm[14] = createMockLandmark(0.62, 0.22);
      lm[15] = createMockLandmark(0.46, 0.10);
      lm[16] = createMockLandmark(0.54, 0.10);
      time += 300;
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.reps).toBe(rep - 1); // Must NOT count here!

      // Back to peak lockout in the air
      lm[13] = createMockLandmark(0.42, 0.18);
      lm[14] = createMockLandmark(0.58, 0.18);
      lm[15] = createMockLandmark(0.46, 0.08);
      lm[16] = createMockLandmark(0.54, 0.08);
      time += 400;
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.reps).toBe(rep - 1); // Still 1 rep!

      // 4. Return all the way to chest (rack)
      lm[13] = createMockLandmark(0.40, 0.40);
      lm[14] = createMockLandmark(0.60, 0.40);
      lm[15] = createMockLandmark(0.48, 0.32);
      lm[16] = createMockLandmark(0.52, 0.32);
      time += 800;
      state = advanceOverheadPressTracker(lm, state, 1, time);
      expect(state.phase).toBe("rack");
      expect(state.reps).toBe(rep); // Exactly 1 rep counted!
      expect(state.repsHistory[rep - 1]?.arm).toBe("both");
    }

    expect(state.reps).toBe(5);
  });
});

describe("motion-library: Dumbbell Lateral Raise Tracker", () => {
  it("tracks raising arms laterally to shoulder plane and returning to thighs", () => {
    let state = createLateralRaiseTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Arms at thighs (abduction angle < 25 deg)
    lm[13] = createMockLandmark(0.43, 0.45);
    lm[15] = createMockLandmark(0.44, 0.60);
    lm[14] = createMockLandmark(0.57, 0.45);
    lm[16] = createMockLandmark(0.56, 0.60);
    state = advanceLateralRaiseTracker(lm, state);
    expect(state.phase).toBe("bottom");

    // 2. Lateral raise to shoulder height: arms abducted ~90 degrees
    lm[13] = createMockLandmark(0.25, 0.28);
    lm[15] = createMockLandmark(0.12, 0.28);
    lm[14] = createMockLandmark(0.75, 0.28);
    lm[16] = createMockLandmark(0.88, 0.28);
    state = advanceLateralRaiseTracker(lm, state);
    expect(state.phase).toBe("peak");

    // 3. Lower down to sides
    lm[13] = createMockLandmark(0.43, 0.45);
    lm[15] = createMockLandmark(0.44, 0.60);
    lm[14] = createMockLandmark(0.57, 0.45);
    lm[16] = createMockLandmark(0.56, 0.60);
    state = advanceLateralRaiseTracker(lm, state);
    expect(state.phase).toBe("bottom");
    expect(state.reps).toBe(1);
  });
});

describe("motion-library: Kettlebell Swing Tracker", () => {
  it("tracks hip hinge explosion and distinguishes swings from squats", () => {
    let state = createKettlebellSwingTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Hinge bottom: hips pushed back (torso forward, knees soft ~140 deg, wrists between thighs)
    lm[0] = createMockLandmark(0.5, 0.38); // Torso inclined forward
    lm[11] = createMockLandmark(0.45, 0.42);
    lm[12] = createMockLandmark(0.55, 0.42);
    lm[15] = createMockLandmark(0.50, 0.65); // Hands deep between legs
    lm[16] = createMockLandmark(0.50, 0.65);
    lm[23] = createMockLandmark(0.45, 0.50); // Hips back
    lm[24] = createMockLandmark(0.55, 0.50);
    lm[25] = createMockLandmark(0.45, 0.72); // Knees moderately soft
    lm[26] = createMockLandmark(0.55, 0.72);
    state = advanceKettlebellSwingTracker(lm, state);
    expect(state.phase).toBe("hinge");

    // 2. Drive & Float: Explosive hip extension, arms float up to chest/eye level
    lm[0] = createMockLandmark(0.5, 0.15); // Upright torso
    lm[15] = createMockLandmark(0.50, 0.30); // Hands at chest level
    lm[16] = createMockLandmark(0.50, 0.30);
    lm[23] = createMockLandmark(0.45, 0.55); // Full hip extension
    lm[24] = createMockLandmark(0.55, 0.55);
    state = advanceKettlebellSwingTracker(lm, state);
    expect(state.phase).toBe("float");

    // 3. Return to hinge
    lm[15] = createMockLandmark(0.50, 0.65);
    lm[16] = createMockLandmark(0.50, 0.65);
    state = advanceKettlebellSwingTracker(lm, state);
    expect(state.reps).toBe(1);
  });
});

describe("motion-library: Handstand Hold Tracker (Calisthenics)", () => {
  it("detects inverted human pose and tracks accumulated hold duration in seconds", () => {
    let state = createHandstandTracker();
    const lm = createBaseBodyLandmarks();

    // Normal standing person: feet at bottom (y=0.95), head at top (y=0.15)
    state = advanceHandstandTracker(lm, state, 1.0);
    expect(state.isInverted).toBe(false);
    expect(state.holdSeconds).toBe(0);

    // Invert the person: feet (27, 28) near top (y=0.10), hands (15, 16) on floor (y=0.90), head (0) near bottom (y=0.85)
    lm[27] = createMockLandmark(0.45, 0.10); // Feet at ceiling
    lm[28] = createMockLandmark(0.55, 0.10);
    lm[25] = createMockLandmark(0.45, 0.28); // Knees
    lm[26] = createMockLandmark(0.55, 0.28);
    lm[23] = createMockLandmark(0.45, 0.48); // Hips
    lm[24] = createMockLandmark(0.55, 0.48);
    lm[11] = createMockLandmark(0.42, 0.72); // Shoulders
    lm[12] = createMockLandmark(0.58, 0.72);
    lm[0] = createMockLandmark(0.50, 0.82); // Head near floor
    lm[15] = createMockLandmark(0.40, 0.90); // Hands on ground
    lm[16] = createMockLandmark(0.60, 0.90);

    // Frame 1: 0.5s hold
    state = advanceHandstandTracker(lm, state, 0.5);
    expect(state.isInverted).toBe(true);
    expect(state.holdSeconds).toBeCloseTo(0.5, 1);

    // Frame 2: Another 1.0s hold
    state = advanceHandstandTracker(lm, state, 1.0);
    expect(state.isInverted).toBe(true);
    expect(state.holdSeconds).toBeCloseTo(1.5, 1);
  });
});

describe("motion-library: Bent-over Row Tracker", () => {
  it("tracks rowing dumbbells towards hips with proper torso hinge", () => {
    let state = createBentOverRowTracker();
    const lm = createBaseBodyLandmarks();

    // 1. Bottom: Arms extended hanging down (~150 deg elbow angle), torso forward
    lm[11] = createMockLandmark(0.40, 0.40);
    lm[12] = createMockLandmark(0.60, 0.40);
    lm[13] = createMockLandmark(0.40, 0.55);
    lm[14] = createMockLandmark(0.60, 0.55);
    lm[15] = createMockLandmark(0.40, 0.70);
    lm[16] = createMockLandmark(0.60, 0.70);
    state = advanceBentOverRowTracker(lm, state);
    expect(state.phase).toBe("bottom");

    // 2. Rowing up: elbows flex to < 85 deg
    lm[13] = createMockLandmark(0.35, 0.38);
    lm[14] = createMockLandmark(0.65, 0.38);
    lm[15] = createMockLandmark(0.38, 0.45);
    lm[16] = createMockLandmark(0.62, 0.45);
    state = advanceBentOverRowTracker(lm, state);
    expect(state.phase).toBe("contracted");

    // 3. Return to bottom
    lm[13] = createMockLandmark(0.40, 0.55);
    lm[14] = createMockLandmark(0.60, 0.55);
    lm[15] = createMockLandmark(0.40, 0.70);
    lm[16] = createMockLandmark(0.60, 0.70);
    state = advanceBentOverRowTracker(lm, state);
    expect(state.phase).toBe("bottom");
    expect(state.reps).toBe(1);
  });
});

describe("motion-library: Goblet Squat Tracker", () => {
  it("tracks deep goblet squat while validating weight is held at chest", () => {
    let state = createGobletSquatTracker();
    const lm = createBaseBodyLandmarks();

    // Hands at chest
    lm[15] = createMockLandmark(0.48, 0.35);
    lm[16] = createMockLandmark(0.52, 0.35);

    // 1. Standing
    state = advanceGobletSquatTracker(lm, state);
    expect(state.phase).toBe("standing");
    expect(state.weightHeldAtChest).toBe(true);

    // 2. Deep squat: knees bent < 100 deg
    lm[23] = createMockLandmark(0.45, 0.85); // Hips dropped deep
    lm[24] = createMockLandmark(0.55, 0.85);
    lm[25] = createMockLandmark(0.40, 0.85); // Knees forward & deep
    lm[26] = createMockLandmark(0.60, 0.85);
    lm[15] = createMockLandmark(0.48, 0.65); // Hands still near chest
    lm[16] = createMockLandmark(0.52, 0.65);
    state = advanceGobletSquatTracker(lm, state);
    expect(state.phase).toBe("bottom");

    // 3. Rise back to standing
    lm[23] = createMockLandmark(0.45, 0.55);
    lm[24] = createMockLandmark(0.55, 0.55);
    lm[25] = createMockLandmark(0.45, 0.75);
    lm[26] = createMockLandmark(0.55, 0.75);
    lm[15] = createMockLandmark(0.48, 0.35);
    lm[16] = createMockLandmark(0.52, 0.35);
    state = advanceGobletSquatTracker(lm, state);
    expect(state.phase).toBe("standing");
    expect(state.reps).toBe(1);
  });
});

describe("motion-library: Pike Pushup & Bench Dips Trackers", () => {
  it("tracks pike pushup reps in inverted V position", () => {
    let state = createPikePushupTracker();
    const lm = createBaseBodyLandmarks();

    // Pike position: hips elevated, elbows straight (> 145 deg)
    lm[23] = createMockLandmark(0.45, 0.35); // Hips high
    lm[11] = createMockLandmark(0.42, 0.55); // Shoulders lower
    lm[13] = createMockLandmark(0.40, 0.70); // Elbows
    lm[15] = createMockLandmark(0.40, 0.85); // Hands on floor
    state = advancePikePushupTracker(lm, state);
    expect(state.phase).toBe("lockout");

    // Bottom of pike pushup: elbow flexed <= 100 deg
    lm[13] = createMockLandmark(0.30, 0.65);
    lm[15] = createMockLandmark(0.40, 0.75);
    state = advancePikePushupTracker(lm, state);
    expect(state.phase).toBe("bottom");

    // Press back up to lockout
    lm[13] = createMockLandmark(0.40, 0.70);
    lm[15] = createMockLandmark(0.40, 0.85);
    state = advancePikePushupTracker(lm, state);
    expect(state.phase).toBe("lockout");
    expect(state.reps).toBe(1);
  });

  it("tracks bench dips elbow flexion and extension", () => {
    let state = createBenchDipsTracker();
    const lm = createBaseBodyLandmarks();

    // Lockout
    lm[11] = createMockLandmark(0.45, 0.40);
    lm[13] = createMockLandmark(0.45, 0.55);
    lm[15] = createMockLandmark(0.45, 0.70);
    state = advanceBenchDipsTracker(lm, state);
    expect(state.phase).toBe("lockout");

    // Bottom dip <= 100 deg
    lm[13] = createMockLandmark(0.30, 0.50);
    lm[15] = createMockLandmark(0.45, 0.55);
    state = advanceBenchDipsTracker(lm, state);
    expect(state.phase).toBe("bottom");

    // Press to lockout
    lm[13] = createMockLandmark(0.45, 0.55);
    lm[15] = createMockLandmark(0.45, 0.70);
    state = advanceBenchDipsTracker(lm, state);
    expect(state.phase).toBe("lockout");
    expect(state.reps).toBe(1);
  });
});

describe("motion-library: Calf Raise Tracker", () => {
  it("tracks heel lift / plantarflexion cycle", () => {
    let state = createCalfRaiseTracker();
    const lm = createBaseBodyLandmarks();

    // Standing flat on feet: ankles at y=0.95
    lm[27] = createMockLandmark(0.45, 0.95);
    lm[28] = createMockLandmark(0.55, 0.95);
    state = advanceCalfRaiseTracker(lm, state);
    expect(state.phase).toBe("flat");

    // Raise onto toes: ankles lift up to y=0.91 (> 0.025 lift delta)
    lm[27] = createMockLandmark(0.45, 0.91);
    lm[28] = createMockLandmark(0.55, 0.91);
    state = advanceCalfRaiseTracker(lm, state);
    expect(state.phase).toBe("peak");

    // Lower back flat: ankles return to y=0.95
    lm[27] = createMockLandmark(0.45, 0.95);
    lm[28] = createMockLandmark(0.55, 0.95);
    state = advanceCalfRaiseTracker(lm, state);
    expect(state.phase).toBe("flat");
    expect(state.reps).toBe(1);
  });
});

describe("motion-library: Bulgarian Split Squat Tracker", () => {
  it("counts a full repetition only when the rear foot is visibly elevated", () => {
    let state = createBulgarianSplitSquatTracker();
    const lm = createBaseBodyLandmarks();

    lm[27] = createMockLandmark(0.40, 0.68);
    lm[29] = createMockLandmark(0.40, 0.70);
    lm[31] = createMockLandmark(0.40, 0.72);
    lm[28] = createMockLandmark(0.55, 0.95);
    lm[30] = createMockLandmark(0.55, 0.96);
    lm[32] = createMockLandmark(0.55, 0.98);

    state = advanceBulgarianSplitSquatTracker(lm, state);
    expect(state.phase).toBe("standing");
    expect(state.frontLeg).toBe("right");
    expect(state.rearFootElevated).toBe(true);

    lm[24] = createMockLandmark(0.50, 0.60);
    lm[26] = createMockLandmark(0.68, 0.72);
    state = advanceBulgarianSplitSquatTracker(lm, state);
    expect(state.phase).toBe("bottom");

    lm[24] = createMockLandmark(0.55, 0.55);
    lm[26] = createMockLandmark(0.55, 0.75);
    state = advanceBulgarianSplitSquatTracker(lm, state);
    expect(state.phase).toBe("standing");
    expect(state.reps).toBe(1);
  });

  it("does not start a repetition when both feet remain on the same level", () => {
    const lm = createBaseBodyLandmarks();
    lm[29] = createMockLandmark(0.45, 0.96);
    lm[30] = createMockLandmark(0.55, 0.96);
    let state = createBulgarianSplitSquatTracker();

    lm[24] = createMockLandmark(0.50, 0.60);
    lm[26] = createMockLandmark(0.68, 0.72);
    state = advanceBulgarianSplitSquatTracker(lm, state);

    expect(state.phase).toBe("standing");
    expect(state.reps).toBe(0);
    expect(state.formWarning).toMatch(/bakre foten/i);
  });
});

describe("motion-library: Dumbbell RDL Tracker", () => {
  it("counts a controlled hip hinge with softly bent knees", () => {
    let state = createDumbbellRdlTracker();
    const lm = createBaseBodyLandmarks();

    state = advanceDumbbellRdlTracker(lm, state);
    expect(state.phase).toBe("standing");

    lm[11] = createMockLandmark(0.20, 0.58);
    lm[12] = createMockLandmark(0.30, 0.58);
    lm[23] = createMockLandmark(0.45, 0.55);
    lm[24] = createMockLandmark(0.55, 0.55);
    state = advanceDumbbellRdlTracker(lm, state);
    expect(state.phase).toBe("bottom");
    expect(state.formWarning).toBeNull();

    lm[11] = createMockLandmark(0.42, 0.28);
    lm[12] = createMockLandmark(0.58, 0.28);
    state = advanceDumbbellRdlTracker(lm, state);
    expect(state.phase).toBe("standing");
    expect(state.reps).toBe(1);
  });

  it("rejects a squat-like bottom position with deeply bent knees", () => {
    let state = createDumbbellRdlTracker();
    const lm = createBaseBodyLandmarks();
    lm[11] = createMockLandmark(0.20, 0.58);
    lm[12] = createMockLandmark(0.30, 0.58);
    lm[23] = createMockLandmark(0.45, 0.72);
    lm[24] = createMockLandmark(0.55, 0.72);
    lm[25] = createMockLandmark(0.60, 0.78);
    lm[26] = createMockLandmark(0.40, 0.78);

    state = advanceDumbbellRdlTracker(lm, state);

    expect(state.reps).toBe(0);
    expect(state.validBottom).toBe(false);
    expect(state.formWarning).toMatch(/höften bakåt/i);
  });
});

describe("motion-library: Unified Exercise Tracker & Dispatcher", () => {
  it("initializes and advances every verified exercise without crashing", () => {
    const allExercises: readonly TrackableExerciseId[] = TRACKABLE_EXERCISE_IDS;

    const lm = createBaseBodyLandmarks();

    for (const exId of allExercises) {
      let state = createUnifiedExerciseTracker(exId);
      expect(state.exerciseId).toBe(exId);
      expect(state.reps).toBe(0);

      state = advanceUnifiedExerciseTracker(state, lm, 0.5, 1, 1000);
      expect(state.exerciseId).toBe(exId);
      expect(typeof state.metricLabel).toBe("string");
      expect(typeof state.formScore).toBe("number");
    }
  });
});
