import { describe, expect, it } from "vitest";

import type { MotionLandmark } from "../motion-engine";
import {
  advanceSquatTracker,
  buildSquatTestReport,
  calculateSquatSymmetry,
  createSquatTrackerState,
  measureSquatAngles,
  motionJointAngle,
  squatTestInstruction,
  squatVoiceCue,
  type SquatAngleMeasurement,
} from "../motion-squat";

function point(x: number, y: number, visibility = 1): MotionLandmark {
  return { x, y, z: 0, visibility };
}

function measurement(knee: number | null, trackedSides: 0 | 1 | 2 = knee === null ? 0 : 2): SquatAngleMeasurement {
  return {
    left: null,
    right: null,
    hip: knee,
    knee,
    ankle: knee,
    trackedSides,
  };
}

function runAngles(angles: readonly [number, number | null][]) {
  return angles.reduce(
    (state, [timestampMs, knee]) => advanceSquatTracker(state, measurement(knee), timestampMs),
    createSquatTrackerState(),
  );
}

describe("motion squat geometry", () => {
  it("calculates a stable joint angle and clamps floating point cosine", () => {
    expect(motionJointAngle(point(0.2, 0.5), point(0.5, 0.5), point(0.5, 0.2))).toBeCloseTo(90);
    expect(motionJointAngle(point(0.2, 0.5), point(0.5, 0.5), point(0.8, 0.5))).toBeCloseTo(180);
  });

  it("rejects a joint when one landmark has low confidence", () => {
    expect(motionJointAngle(point(0.2, 0.5), point(0.5, 0.5, 0.2), point(0.8, 0.5))).toBeNull();
  });

  it("does not let inferred depth distort front-view joint angles", () => {
    const first = { ...point(0.2, 0.5), z: -4 };
    const joint = { ...point(0.5, 0.5), z: 3 };
    const third = { ...point(0.5, 0.2), z: -2 };
    expect(motionJointAngle(first, joint, third)).toBeCloseTo(90);
  });

  it("measures both sides and falls back to the visible side", () => {
    const landmarks = Array.from({ length: 33 }, () => point(0, 0, 0));
    landmarks[11] = point(0.3, 0.1);
    landmarks[23] = point(0.3, 0.3);
    landmarks[25] = point(0.3, 0.55);
    landmarks[27] = point(0.55, 0.55);
    landmarks[31] = point(0.7, 0.55);

    const leftOnly = measureSquatAngles(landmarks);
    expect(leftOnly.trackedSides).toBe(1);
    expect(leftOnly.left?.knee).toBeCloseTo(90);
    expect(leftOnly.right).toBeNull();
    expect(leftOnly.knee).toBeCloseTo(90);

    landmarks[12] = point(0.7, 0.1);
    landmarks[24] = point(0.7, 0.3);
    landmarks[26] = point(0.7, 0.55);
    landmarks[28] = point(0.45, 0.55);
    landmarks[32] = point(0.3, 0.55);
    expect(measureSquatAngles(landmarks).trackedSides).toBe(2);
  });
});

describe("motion squat state machine", () => {
  it("counts exactly one complete standing-bottom-standing repetition", () => {
    const state = runAngles([
      [0, 170],
      [200, 145],
      [400, 120],
      [600, 100],
      [800, 110],
      [1_000, 125],
      [1_200, 145],
      [1_400, 165],
    ]);
    expect(state.phase).toBe("standing");
    expect(state.reps).toBe(1);
    expect(state.fullReps).toBe(1);
    expect(state.lastRep).toMatchObject({
      durationMs: 1_200,
      minimumKneeAngle: 100,
      classification: "full",
      romPercent: 100,
    });
  });

  it("classifies a half squat reaching 125° as half and not full", () => {
    const state = runAngles([
      [0, 170],
      [200, 145],
      [500, 125],
      [700, 138],
      [900, 165],
    ]);
    expect(state.reps).toBe(1);
    expect(state.halfReps).toBe(1);
    expect(state.fullReps).toBe(0);
    expect(state.lastRep?.classification).toBe("half");
    expect(state.lastRep?.minimumKneeAngle).toBe(125);
    expect(state.lastRep?.romPercent).toBeGreaterThanOrEqual(45);
    expect(state.lastRep?.romPercent).toBeLessThan(85);
  });

  it("does not count a shallow knee dip that never passes the half-squat threshold (150°)", () => {
    const state = runAngles([
      [0, 170],
      [200, 155],
      [500, 150],
      [700, 152],
      [900, 165],
    ]);
    expect(state.reps).toBe(0);
    expect(state.halfReps).toBe(0);
    expect(state.fullReps).toBe(0);
    expect(state.phase).toBe("standing");
  });

  it("reliably classifies a chair sit (143° knee or relative depth 0.54) as a half rep", () => {
    const state = runAngles([
      [0, 175],
      [300, 155],
      [600, 143],
      [900, 148],
      [1_200, 170],
    ]);
    expect(state.reps).toBe(1);
    expect(state.halfReps).toBe(1);
    expect(state.fullReps).toBe(0);
    expect(state.lastRep?.classification).toBe("half");
    expect(state.lastRep?.minimumKneeAngle).toBe(143);
  });

  it("classifies a deep squat as full and records ROM percentage >= 85%", () => {
    const state = runAngles([
      [0, 170],
      [200, 145],
      [400, 120],
      [600, 95],
      [800, 110],
      [1_000, 125],
      [1_200, 145],
      [1_400, 165],
    ]);
    expect(state.reps).toBe(1);
    expect(state.fullReps).toBe(1);
    expect(state.halfReps).toBe(0);
    expect(state.lastRep?.classification).toBe("full");
    expect(state.lastRep?.romPercent).toBeGreaterThanOrEqual(85);
  });

  it("uses bottom hysteresis without double-counting jitter", () => {
    const state = runAngles([
      [0, 170],
      [200, 145],
      [500, 102],
      [650, 119],
      [800, 104],
      [950, 121],
      [1_100, 106],
      [1_250, 130],
      [1_500, 165],
    ]);
    expect(state.reps).toBe(1);
    expect(state.fullReps).toBe(1);
  });

  it("pauses briefly on lost tracking and abandons a stale partial rep", () => {
    let state = runAngles([
      [0, 170],
      [200, 140],
      [400, 100],
      [600, null],
    ]);
    expect(state.phase).toBe("bottom");
    expect(state.tracking).toBe(false);

    // Holds pose briefly without immediately discarding
    state = advanceSquatTracker(state, measurement(null), 1_100);
    expect(state.phase).toBe("bottom");

    // After prolonged loss (> 2.5s), abandons the partial rep
    state = advanceSquatTracker(state, measurement(null), 3_200);
    expect(state.phase).toBe("waiting");
    expect(state.reps).toBe(0);
  });

  it("tracks squats accurately even when ankles/feet are cut off by the bottom of the camera", () => {
    // Normal living-room distance (1.8 - 2.5 m):
    // Shoulders, hips and knees visible. Ankles/feet cut off at screen bottom (visibility 0).
    const standingLandmarks = Array.from({ length: 33 }, () => point(0, 0, 0));
    standingLandmarks[11] = point(0.45, 0.20, 1); // shoulder
    standingLandmarks[12] = point(0.55, 0.20, 1);
    standingLandmarks[23] = point(0.45, 0.45, 1); // hip
    standingLandmarks[24] = point(0.55, 0.45, 1);
    standingLandmarks[25] = point(0.45, 0.70, 1); // knee
    standingLandmarks[26] = point(0.55, 0.70, 1);
    // ankles cut off:
    standingLandmarks[27] = { x: 0.45, y: 1.05, z: 0, visibility: 0 };
    standingLandmarks[28] = { x: 0.55, y: 1.05, z: 0, visibility: 0 };

    const standingM = measureSquatAngles(standingLandmarks);
    expect(standingM.trackedSides).toBe(2);
    expect(standingM.knee).toBeGreaterThanOrEqual(160);

    // Now sitting down on a chair (thighs horizontal, knees forward):
    const sittingLandmarks = Array.from({ length: 33 }, () => point(0, 0, 0));
    sittingLandmarks[11] = point(0.40, 0.35, 1); // shoulder
    sittingLandmarks[12] = point(0.50, 0.35, 1);
    sittingLandmarks[23] = point(0.35, 0.65, 1); // hip drops back
    sittingLandmarks[24] = point(0.45, 0.65, 1);
    sittingLandmarks[25] = point(0.60, 0.65, 1); // knee horizontal with hip
    sittingLandmarks[26] = point(0.70, 0.65, 1);
    sittingLandmarks[27] = { x: 0.60, y: 1.05, z: 0, visibility: 0 };
    sittingLandmarks[28] = { x: 0.70, y: 1.05, z: 0, visibility: 0 };

    const sittingM = measureSquatAngles(sittingLandmarks);
    expect(sittingM.trackedSides).toBe(2);
    expect(sittingM.knee).toBeLessThanOrEqual(105);
  });

  it("ignores non-monotonic duplicate frames", () => {
    const standing = advanceSquatTracker(createSquatTrackerState(), measurement(170), 100);
    expect(advanceSquatTracker(standing, measurement(90), 100)).toBe(standing);
  });

  it("guides and classifies 10 half squats followed by 10 full squats in Step 24 protocol", () => {
    let state = createSquatTrackerState();
    let clock = 0;

    // 10 half squats (descend to 122°, return to 165°)
    for (let i = 0; i < 10; i++) {
      state = advanceSquatTracker(state, measurement(170), clock); clock += 100;
      state = advanceSquatTracker(state, measurement(140), clock); clock += 200;
      state = advanceSquatTracker(state, measurement(122), clock); clock += 200;
      state = advanceSquatTracker(state, measurement(135), clock); clock += 200;
      state = advanceSquatTracker(state, measurement(165), clock); clock += 300;
      expect(state.halfReps).toBe(i + 1);
      expect(state.lastRep?.classification).toBe("half");
    }
    expect(state.halfReps).toBe(10);
    expect(state.fullReps).toBe(0);
    expect(state.reps).toBe(10);

    // 10 full squats (descend to 98°, return to 165°)
    for (let i = 0; i < 10; i++) {
      state = advanceSquatTracker(state, measurement(170), clock); clock += 100;
      state = advanceSquatTracker(state, measurement(140), clock); clock += 200;
      state = advanceSquatTracker(state, measurement(98), clock); clock += 300;
      state = advanceSquatTracker(state, measurement(120), clock); clock += 200;
      state = advanceSquatTracker(state, measurement(165), clock); clock += 300;
      expect(state.fullReps).toBe(i + 1);
      expect(state.lastRep?.classification).toBe("full");
    }
    expect(state.halfReps).toBe(10);
    expect(state.fullReps).toBe(10);
    expect(state.reps).toBe(20);

    const report = buildSquatTestReport(state, "2026-09-06T19:00:00.000Z");
    expect(report.halfReps).toBe(10);
    expect(report.fullReps).toBe(10);
    expect(report.reps).toBe(20);
    expect(report.romClassificationPassed).toBe(true);
    expect(report.protocol).toBe("rom-step-24");
  });

  it("provides deterministic spoken counting and milestones for chair squat protocol", () => {
    const zeroState = createSquatTrackerState();
    const halfOne = { ...zeroState, halfReps: 1, reps: 1, lastRep: { durationMs: 800, minimumKneeAngle: 125, classification: "half" as const, romPercent: 65, relativeDepth: 0.5 } };
    const halfTen = { ...zeroState, halfReps: 10, reps: 10, lastRep: { durationMs: 800, minimumKneeAngle: 125, classification: "half" as const, romPercent: 65, relativeDepth: 0.5 } };
    const fullTen = { ...zeroState, halfReps: 10, fullReps: 10, reps: 20, lastRep: { durationMs: 1000, minimumKneeAngle: 95, classification: "full" as const, romPercent: 95, relativeDepth: 0.85 } };

    expect(squatVoiceCue(zeroState, halfOne)?.text).toBe("Halv 1.");
    expect(squatVoiceCue(zeroState, halfOne)?.sound).toBe("rep");
    expect(squatVoiceCue(zeroState, halfTen)?.text).toContain("Tio halva klara");
    expect(squatVoiceCue(zeroState, halfTen)?.sound).toBe("milestone");
    expect(squatVoiceCue(zeroState, fullTen)?.text).toContain("Tio fulla klara");
    expect(squatVoiceCue(zeroState, fullTen)?.sound).toBe("milestone");
    expect(squatTestInstruction(halfOne)).toContain("1/10 klara");
    expect(squatTestInstruction(fullTen)).toContain("godkänt");
  });

  it("triggers real-time voice and sound cues when reaching chair depth", () => {
    const zeroState = createSquatTrackerState();
    const descending = {
      ...zeroState,
      phase: "descending" as const,
      measurement: { ...zeroState.measurement, knee: 110, trackedSides: 2 as const },
    };
    const sittingBottom = {
      ...zeroState,
      phase: "bottom" as const,
      measurement: { ...zeroState.measurement, knee: 98, trackedSides: 2 as const },
    };
    const bottomCue = squatVoiceCue(descending, sittingBottom);
    expect(bottomCue?.text).toBe("Där, res dig!");
    expect(bottomCue?.priority).toBe(true);
    expect(bottomCue?.sound).toBe("full-depth");
  });

  it("calculates body-relative geometry and depth ratio when landmark coordinates are provided", () => {
    const landmarks = Array.from({ length: 33 }, () => point(0, 0, 0));
    // Set up a standard person standing:
    // hip at (0.5, 0.35), knee at (0.5, 0.60), ankle at (0.5, 0.85) -> thigh length = 0.25, shin length = 0.25
    landmarks[11] = point(0.4, 0.15);
    landmarks[12] = point(0.6, 0.15);
    landmarks[23] = point(0.45, 0.35);
    landmarks[24] = point(0.55, 0.35);
    landmarks[25] = point(0.45, 0.60);
    landmarks[26] = point(0.55, 0.60);
    landmarks[27] = point(0.45, 0.85);
    landmarks[28] = point(0.55, 0.85);

    const standingMeasurement = measureSquatAngles(landmarks);
    expect(standingMeasurement.thighLength).toBeCloseTo(0.25, 2);
    expect(standingMeasurement.shinLength).toBeCloseTo(0.25, 2);
    expect(standingMeasurement.hipY).toBeCloseTo(0.35, 2);
  });

  it("does not count reps while sitting on a chair and wiggling knees until the user stands up", () => {
    let state = createSquatTrackerState();
    let clock = 100;

    // 1. Standing upright (calibrates standingHipY)
    state = advanceSquatTracker(state, {
      ...measurement(175),
      hip: 175,
      hipY: 0.35,
      thighLength: 0.25,
    }, clock);
    clock += 100;
    expect(state.phase).toBe("standing");

    state = advanceSquatTracker(state, {
      ...measurement(175),
      hip: 175,
      hipY: 0.35,
      thighLength: 0.25,
    }, clock);
    clock += 100;
    expect(state.standingHipY).toBeCloseTo(0.35, 2);

    // 2. Sit down on chair: hip drops to 0.48 (relativeDepth ~ 0.52), hip flexes to 105°
    state = advanceSquatTracker(state, {
      ...measurement(140),
      hip: 105,
      hipY: 0.48,
      thighLength: 0.25,
    }, clock);
    clock += 300;
    expect(state.phase).toBe("descending");

    // 3. Wiggle knees while seated (knee angle changes between 122° and 160° while sitting)
    // Hip is still down (0.48) and flexed (105°)
    for (let i = 0; i < 5; i++) {
      state = advanceSquatTracker(state, {
        ...measurement(125),
        hip: 105,
        hipY: 0.48,
        thighLength: 0.25,
      }, clock);
      clock += 200;

      state = advanceSquatTracker(state, {
        ...measurement(160),
        hip: 105,
        hipY: 0.48,
        thighLength: 0.25,
      }, clock);
      clock += 200;
    }

    // Must NOT count any reps while still seated!
    expect(state.reps).toBe(0);
    expect(state.halfReps).toBe(0);
    expect(state.phase).not.toBe("standing");

    // 4. User actually stands up: hip returns to 0.35, hip angle straightens to 175°, knee extends
    state = advanceSquatTracker(state, {
      ...measurement(175),
      hip: 175,
      hipY: 0.35,
      thighLength: 0.25,
    }, clock);
    clock += 200;

    // Now exactly ONE rep is completed!
    expect(state.reps).toBe(1);
    expect(state.halfReps).toBe(1);
    expect(state.phase).toBe("standing");
  });

  it("accurately breaks down eccentric, bottom, and concentric tempo across 3 variations", () => {
    let state = createSquatTrackerState();
    let clock = 100;

    // Calibrate standing
    state = advanceSquatTracker(state, { ...measurement(175), hip: 175, hipY: 0.35, thighLength: 0.25 }, clock); clock += 100;
    state = advanceSquatTracker(state, { ...measurement(175), hip: 175, hipY: 0.35, thighLength: 0.25 }, clock); clock += 100;

    // --- Variation 1: Normal tempo (~1-0-1) ---
    // Start descent at clock = 300
    state = advanceSquatTracker(state, { ...measurement(145), hip: 140, hipY: 0.45, thighLength: 0.25 }, clock); // 300
    clock += 800; // descend 800ms
    state = advanceSquatTracker(state, { ...measurement(100), hip: 90, hipY: 0.65, thighLength: 0.25 }, clock); // 1100 (enters bottom)
    clock += 150; // brief bottom 150ms
    state = advanceSquatTracker(state, { ...measurement(125), hip: 120, hipY: 0.55, thighLength: 0.25 }, clock); // 1250 (exits bottom to ascending)
    clock += 850; // ascend 850ms
    state = advanceSquatTracker(state, { ...measurement(175), hip: 175, hipY: 0.35, thighLength: 0.25 }, clock); // 2100 (standing)
    clock += 200;

    expect(state.reps).toBe(1);
    const rep1 = state.lastRep;
    expect(rep1?.tempo?.notation).toBe("1-0-1");
    expect(rep1?.tempo?.eccentricMs).toBeCloseTo(800, -2);
    expect(rep1?.tempo?.bottomMs).toBeCloseTo(150, -2);
    expect(rep1?.tempo?.concentricMs).toBeCloseTo(850, -2);

    // --- Variation 2: Slow eccentric 3s (~3-0-1) ---
    state = advanceSquatTracker(state, { ...measurement(150), hip: 145, hipY: 0.40, thighLength: 0.25 }, clock); // start descent
    const start2 = clock;
    clock += 1_000;
    state = advanceSquatTracker(state, { ...measurement(135), hip: 130, hipY: 0.48, thighLength: 0.25 }, clock);
    clock += 1_000;
    state = advanceSquatTracker(state, { ...measurement(120), hip: 115, hipY: 0.55, thighLength: 0.25 }, clock);
    clock += 1_000;
    state = advanceSquatTracker(state, { ...measurement(95), hip: 85, hipY: 0.65, thighLength: 0.25 }, clock); // reaches bottom (3000ms eccentric)
    clock += 100;
    state = advanceSquatTracker(state, { ...measurement(125), hip: 120, hipY: 0.55, thighLength: 0.25 }, clock); // ascending
    clock += 900;
    state = advanceSquatTracker(state, { ...measurement(175), hip: 175, hipY: 0.35, thighLength: 0.25 }, clock); // standing
    clock += 200;

    expect(state.reps).toBe(2);
    const rep2 = state.lastRep;
    expect(rep2?.tempo?.notation).toBe("3-0-1");
    expect(rep2?.tempo?.eccentricMs).toBeGreaterThanOrEqual(2_800);

    // --- Variation 3: Pause squat 2s (~1-2-1) ---
    state = advanceSquatTracker(state, { ...measurement(145), hip: 140, hipY: 0.45, thighLength: 0.25 }, clock); // start descent
    clock += 1_000;
    state = advanceSquatTracker(state, { ...measurement(95), hip: 85, hipY: 0.65, thighLength: 0.25 }, clock); // enters bottom
    clock += 1_000;
    state = advanceSquatTracker(state, { ...measurement(92), hip: 85, hipY: 0.65, thighLength: 0.25 }, clock); // still in bottom
    clock += 1_000;
    state = advanceSquatTracker(state, { ...measurement(93), hip: 85, hipY: 0.65, thighLength: 0.25 }, clock); // 2000ms pause in bottom
    clock += 100;
    state = advanceSquatTracker(state, { ...measurement(125), hip: 120, hipY: 0.55, thighLength: 0.25 }, clock); // ascending
    clock += 900;
    state = advanceSquatTracker(state, { ...measurement(175), hip: 175, hipY: 0.35, thighLength: 0.25 }, clock); // standing

    expect(state.reps).toBe(3);
    const rep3 = state.lastRep;
    expect(rep3?.tempo?.notation).toBe("1-2-1");
    expect(rep3?.tempo?.bottomMs).toBeGreaterThanOrEqual(1_900);

    // --- Build Steg 25 Tempo Report ---
    const report = buildSquatTestReport(state, "2026-09-06T19:30:00.000Z", "tempo-step-25");
    expect(report.protocol).toBe("tempo-step-25");
    expect(report.tempoAnalysis).toBeDefined();
    expect(report.tempoAnalysis?.variationsDetected).toBeGreaterThanOrEqual(2);
    expect(report.tempoAnalysis?.tempoPassed).toBe(true);
    expect(report.romClassificationPassed).toBe(true);
  });

  it("calculates bilateral symmetry with safe non-diagnostic observations in Step 26", () => {
    // 1. Balanced repetition
    const balanced = calculateSquatSymmetry(88, 89, 0.008, 0.3);
    expect(balanced).toBeDefined();
    expect(balanced?.dominantSide).toBe("balanced");
    expect(balanced?.symmetryScore).toBeGreaterThanOrEqual(95);
    expect(balanced?.observation).toContain("Jämn och balanserad");

    // 2. Left knee deeper (asymmetric)
    const leftDeeper = calculateSquatSymmetry(78, 98, 0.01, 0.3);
    expect(leftDeeper).toBeDefined();
    expect(leftDeeper?.dominantSide).toBe("left");
    expect(leftDeeper?.kneeAngleDiff).toBe(20);
    expect(leftDeeper?.symmetryScore).toBeLessThan(85);
    expect(leftDeeper?.observation).toBe("Vänster knä böjs något djupare än höger i vändningen.");

    // 3. Right knee deeper (asymmetric)
    const rightDeeper = calculateSquatSymmetry(102, 84, 0.01, 0.3);
    expect(rightDeeper).toBeDefined();
    expect(rightDeeper?.dominantSide).toBe("right");
    expect(rightDeeper?.kneeAngleDiff).toBe(18);
    expect(rightDeeper?.symmetryScore).toBeLessThan(85);
    expect(rightDeeper?.observation).toBe("Höger knä böjs något djupare än vänster i vändningen.");

    // 4. Hip height tilt
    const hipShift = calculateSquatSymmetry(90, 91, 0.035, 0.3);
    expect(hipShift).toBeDefined();
    expect(hipShift?.hipHeightDiff).toBeGreaterThanOrEqual(0.08);
    expect(hipShift?.observation).toBe("Lätt sidledsförskjutning av höften under rörelsen.");

    // 5. Strict safety check: Never generate medical diagnostics or red-flag words
    const forbiddenMedicalTerms = ["skada", "dysfunktion", "felställning", "artros", "svaghet", "patologi", "diagnos", "defekt"];
    for (const term of forbiddenMedicalTerms) {
      expect(balanced?.observation.toLowerCase()).not.toContain(term);
      expect(leftDeeper?.observation.toLowerCase()).not.toContain(term);
      expect(rightDeeper?.observation.toLowerCase()).not.toContain(term);
      expect(hipShift?.observation.toLowerCase()).not.toContain(term);
    }
  });

  it("guides and validates 3 symmetry reps in Step 26 protocol", () => {
    let state = createSquatTrackerState();
    let clock = 1_000;

    const sideMeasurement = (
      leftKnee: number,
      rightKnee: number,
      leftHipY = 0.35,
      rightHipY = 0.35,
    ): SquatAngleMeasurement => {
      const avgKnee = (leftKnee + rightKnee) / 2;
      return {
        left: { hip: avgKnee, knee: leftKnee, ankle: avgKnee, confidence: 0.9, hipY: leftHipY, thighLength: 0.3 },
        right: { hip: avgKnee, knee: rightKnee, ankle: avgKnee, confidence: 0.9, hipY: rightHipY, thighLength: 0.3 },
        hip: avgKnee,
        knee: avgKnee,
        ankle: avgKnee,
        trackedSides: 2,
        thighLength: 0.3,
        hipY: (leftHipY + rightHipY) / 2,
      };
    };

    // Stående neutral baseline
    state = advanceSquatTracker(state, sideMeasurement(178, 178, 0.35, 0.35), clock);
    expect(state.phase).toBe("standing");

    // Rep 1: Symmetrisk rep (båda knän ~88°)
    clock += 100;
    state = advanceSquatTracker(state, sideMeasurement(145, 145, 0.42, 0.42), clock);
    clock += 500;
    state = advanceSquatTracker(state, sideMeasurement(88, 89, 0.65, 0.65), clock);
    clock += 100;
    state = advanceSquatTracker(state, sideMeasurement(125, 125, 0.52, 0.52), clock);
    clock += 500;
    state = advanceSquatTracker(state, sideMeasurement(176, 176, 0.35, 0.35), clock);

    expect(state.reps).toBe(1);
    expect(state.lastRep?.symmetry?.dominantSide).toBe("balanced");
    expect(state.lastRep?.symmetry?.symmetryScore).toBeGreaterThanOrEqual(90);

    // Rep 2: Asymmetrisk (vänster knä djupare, mer böjt = 78° vs 96°)
    clock += 200;
    state = advanceSquatTracker(state, sideMeasurement(145, 148, 0.42, 0.40), clock);
    clock += 500;
    state = advanceSquatTracker(state, sideMeasurement(78, 96, 0.66, 0.62), clock);
    clock += 100;
    state = advanceSquatTracker(state, sideMeasurement(125, 128, 0.52, 0.50), clock);
    clock += 500;
    state = advanceSquatTracker(state, sideMeasurement(176, 176, 0.35, 0.35), clock);

    expect(state.reps).toBe(2);
    expect(state.lastRep?.symmetry?.dominantSide).toBe("left");
    expect(state.lastRep?.symmetry?.kneeAngleDiff).toBe(18);

    // Rep 3: Asymmetrisk (höger knä djupare, 98° vs 80°)
    clock += 200;
    state = advanceSquatTracker(state, sideMeasurement(148, 145, 0.40, 0.42), clock);
    clock += 500;
    state = advanceSquatTracker(state, sideMeasurement(98, 80, 0.62, 0.66), clock);
    clock += 100;
    state = advanceSquatTracker(state, sideMeasurement(128, 125, 0.50, 0.52), clock);
    clock += 500;
    state = advanceSquatTracker(state, sideMeasurement(176, 176, 0.35, 0.35), clock);

    expect(state.reps).toBe(3);
    expect(state.lastRep?.symmetry?.dominantSide).toBe("right");
    expect(state.lastRep?.symmetry?.kneeAngleDiff).toBe(18);

    // Rapport för Steg 26
    const report = buildSquatTestReport(state, "2026-09-06T19:45:00.000Z", "symmetry-step-26");
    expect(report.protocol).toBe("symmetry-step-26");
    expect(report.symmetryAnalysis).toBeDefined();
    expect(report.symmetryAnalysis?.symmetryPassed).toBe(true);
    expect(report.symmetryAnalysis?.asymmetricRepsCount).toBe(2);
    expect(report.symmetryAnalysis?.symmetricRepsCount).toBe(1);
    expect(report.romClassificationPassed).toBe(true);

    // Coaching cues & instruction
    const cue = squatVoiceCue(createSquatTrackerState(0), state, "symmetry-step-26");
    expect(cue).toBeDefined();
    expect(cue?.text).toContain("Symmetritestet är godkänt");
    expect(squatTestInstruction(state, "symmetry-step-26")).toContain("Steg 26 godkänt");
  });
});
