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
});
