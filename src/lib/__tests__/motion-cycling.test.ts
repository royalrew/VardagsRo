import { describe, expect, it } from "vitest";

import { advanceCyclingTracker, createCyclingTracker } from "../motion-cycling";
import type { MotionLandmark } from "../motion-engine";

function cyclingPose(kneeAngleDegrees: number): MotionLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  const radians = kneeAngleDegrees * Math.PI / 180;
  const setLeg = (hip: number, knee: number, ankle: number, offset: number) => {
    landmarks[hip] = { x: offset, y: 0.3, z: 0, visibility: 1 };
    landmarks[knee] = { x: offset, y: 0.5, z: 0, visibility: 1 };
    landmarks[ankle] = {
      x: offset + Math.sin(radians) * 0.2,
      y: 0.5 - Math.cos(radians) * 0.2,
      z: 0,
      visibility: 1,
    };
  };
  setLeg(23, 25, 27, 0.45);
  setLeg(24, 26, 28, 0.55);
  return landmarks;
}

describe("cycling tracker", () => {
  it("counts complete pedal cycles and derives cadence after the second cycle", () => {
    let state = createCyclingTracker();
    state = advanceCyclingTracker(cyclingPose(150), state, 0, 1, 0);
    state = advanceCyclingTracker(cyclingPose(90), state, 0.5, 1, 500);
    state = advanceCyclingTracker(cyclingPose(150), state, 0.5, 1, 1_000);
    expect(state.revolutions).toBe(1);
    expect(state.cadenceRpm).toBeNull();

    state = advanceCyclingTracker(cyclingPose(90), state, 0.5, 1, 1_500);
    state = advanceCyclingTracker(cyclingPose(150), state, 0.5, 1, 2_000);
    expect(state.revolutions).toBe(2);
    expect(state.cadenceRpm).toBe(60);
    expect(state.activeSeconds).toBeGreaterThan(0);
  });

  it("does not count partial flexion as a pedal cycle", () => {
    let state = createCyclingTracker();
    state = advanceCyclingTracker(cyclingPose(150), state, 0, 1, 0);
    state = advanceCyclingTracker(cyclingPose(120), state, 0.5, 1, 500);
    state = advanceCyclingTracker(cyclingPose(150), state, 0.5, 1, 1_000);
    expect(state.revolutions).toBe(0);
  });

  it("accurately counts 20 consecutive revolutions with natural exercise bike angles (112° to 145°)", () => {
    let state = createCyclingTracker();
    let time = 0;

    for (let i = 1; i <= 20; i++) {
      // Flexed at top of stroke (112 deg)
      time += 450;
      state = advanceCyclingTracker(cyclingPose(112), state, 0.45, 1, time);
      // Extended at bottom of stroke (145 deg)
      time += 450;
      state = advanceCyclingTracker(cyclingPose(145), state, 0.45, 1, time);

      expect(state.revolutions).toBe(i);
    }

    expect(state.revolutions).toBe(20);
    expect(state.cadenceRpm).toBeGreaterThan(60);
    expect(state.cadenceRpm).toBeLessThan(75);
    expect(state.revolutionsHistory.length).toBe(20);
  });

  it("accurately tracks pedaling from FRONT VIEW where ankles are obscured and knees oscillate vertically", () => {
    let state = createCyclingTracker();
    let time = 0;

    function frontKneePose(kneeY: number): MotionLandmark[] {
      const landmarks = Array.from({ length: 33 }, () => ({
        x: 0.5,
        y: 0.5,
        z: 0,
        visibility: 0, // Other landmarks obscured by bike/handlebars
      }));
      // Hips visible
      landmarks[23] = { x: 0.45, y: 0.40, z: 0, visibility: 0.9 };
      landmarks[24] = { x: 0.55, y: 0.40, z: 0, visibility: 0.9 };
      // Knees pumping up and down in front view
      landmarks[25] = { x: 0.45, y: kneeY, z: 0, visibility: 0.9 };
      landmarks[26] = { x: 0.55, y: 1.05 - kneeY, z: 0, visibility: 0.9 };
      // Ankles obscured by pedals/flywheel (visibility 0.1)
      landmarks[27] = { x: 0.45, y: 0.85, z: 0, visibility: 0.1 };
      landmarks[28] = { x: 0.55, y: 0.85, z: 0, visibility: 0.1 };
      return landmarks;
    }

    // Initial starting pose with foot down at 0.62
    state = advanceCyclingTracker(frontKneePose(0.62), state, 0, 1, 0);

    // Pedal 10 strokes in front view: knee oscillates between y=0.45 (top) and y=0.62 (bottom)
    for (let i = 1; i <= 10; i++) {
      // Pull knee up towards top of stroke (y decreases to 0.45)
      time += 450;
      state = advanceCyclingTracker(frontKneePose(0.45), state, 0.45, 1, time);
      // Push pedal down (y increases to 0.62)
      time += 450;
      state = advanceCyclingTracker(frontKneePose(0.62), state, 0.45, 1, time);

      expect(state.revolutions).toBe(i);
    }

    expect(state.revolutions).toBe(10);
    expect(state.cadenceRpm).toBeGreaterThan(60);
    expect(state.cadenceRpm).toBeLessThan(75);
  });

  it("accurately tracks 20 revolutions in DIAGONAL view with BOTH angle and vertical knee oscillation without double counting", () => {
    let state = createCyclingTracker();
    let time = 0;

    function diagonalCyclingPose(kneeAngleDegrees: number, kneeY: number): MotionLandmark[] {
      const landmarks = Array.from({ length: 33 }, () => ({
        x: 0.5,
        y: 0.5,
        z: 0,
        visibility: 0.9,
      }));
      const radians = (kneeAngleDegrees * Math.PI) / 180;
      // Right side in foreground (facing camera diagonally)
      landmarks[24] = { x: 0.55, y: 0.40, z: 0, visibility: 0.95 }; // Right hip
      landmarks[26] = { x: 0.55, y: kneeY, z: 0, visibility: 0.95 }; // Right knee
      landmarks[28] = {
        x: 0.55 + Math.sin(radians) * 0.25,
        y: kneeY + Math.cos(radians) * 0.25,
        z: 0,
        visibility: 0.85,
      }; // Right ankle

      // Left leg partially obscured in background
      landmarks[23] = { x: 0.45, y: 0.40, z: 0, visibility: 0.4 };
      landmarks[25] = { x: 0.45, y: 1.05 - kneeY, z: 0, visibility: 0.4 };
      landmarks[27] = { x: 0.45, y: 0.80, z: 0, visibility: 0.2 };
      return landmarks;
    }

    // Start in bottom/extended position
    state = advanceCyclingTracker(diagonalCyclingPose(155, 0.62), state, 0, 1, 0);

    // Simulate 20 pedal strokes
    for (let i = 1; i <= 20; i++) {
      // Top of stroke (flexed knee 102°, knee pulled up to 0.45)
      time += 450;
      state = advanceCyclingTracker(diagonalCyclingPose(102, 0.45), state, 0.45, 1, time);

      // Bottom of stroke (extended knee 155°, knee pushed down to 0.62)
      time += 450;
      state = advanceCyclingTracker(diagonalCyclingPose(155, 0.62), state, 0.45, 1, time);

      expect(state.revolutions).toBe(i);
    }

    expect(state.revolutions).toBe(20);
    expect(state.cadenceRpm).toBeGreaterThan(60);
    expect(state.cadenceRpm).toBeLessThan(75);
    expect(state.revolutionsHistory.length).toBe(20);
  });
});

