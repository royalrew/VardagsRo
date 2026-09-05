import { describe, expect, it } from "vitest";

import type { MotionLandmark } from "./motion-engine";
import { MotionLandmarkStabilizer } from "./motion-stabilizer";

function pose(overrides: Partial<MotionLandmark> = {}): MotionLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    ...overrides,
  }));
}

describe("MotionLandmarkStabilizer", () => {
  it("smooths small torso jitter", () => {
    const stabilizer = new MotionLandmarkStabilizer();
    stabilizer.stabilize(pose(), 0);
    const moved = pose();
    moved[23] = { ...moved[23], x: 0.52 };

    const result = stabilizer.stabilize(moved, 50);

    expect(result.landmarks[23].x).toBeGreaterThan(0.5);
    expect(result.landmarks[23].x).toBeLessThan(0.52);
    expect(result.diagnostics.limitedOutliers).toBe(0);
  });

  it("keeps fast wrist motion responsive", () => {
    const stabilizer = new MotionLandmarkStabilizer();
    const initial = pose();
    initial[15] = { ...initial[15], x: 0.2 };
    stabilizer.stabilize(initial, 0);
    const punch = pose();
    punch[15] = { ...punch[15], x: 0.6 };

    const result = stabilizer.stabilize(punch, 50);

    expect(result.landmarks[15].x).toBeGreaterThan(0.53);
    expect(result.diagnostics.limitedOutliers).toBe(0);
  });

  it("holds a briefly occluded landmark without treating it as reliable", () => {
    const stabilizer = new MotionLandmarkStabilizer();
    stabilizer.stabilize(pose(), 0);
    const occluded = pose();
    occluded[25] = { x: 0.95, y: 0.1, z: 1, visibility: 0.1 };

    const result = stabilizer.stabilize(occluded, 80);

    expect(result.landmarks[25]).toMatchObject({ x: 0.5, y: 0.5, visibility: 0.1 });
    expect(result.diagnostics.heldLowConfidence).toBe(1);
  });

  it("limits implausible torso jumps but resets after a long gap", () => {
    const stabilizer = new MotionLandmarkStabilizer();
    stabilizer.stabilize(pose(), 0);
    const jumped = pose();
    jumped[23] = { ...jumped[23], x: 1 };

    const limited = stabilizer.stabilize(jumped, 16);
    expect(limited.landmarks[23].x).toBeLessThan(0.8);
    expect(limited.diagnostics.limitedOutliers).toBe(1);

    const reset = stabilizer.stabilize(jumped, 700);
    expect(reset.landmarks[23].x).toBe(1);
    expect(reset.diagnostics.limitedOutliers).toBe(0);
  });
});
