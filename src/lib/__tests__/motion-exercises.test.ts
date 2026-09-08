import { describe, expect, it } from "vitest";

import type { MotionLandmark } from "../motion-engine";
import {
  advanceJumpingJackTracker,
  advanceLungeTracker,
  advancePlankTracker,
  advancePushupTracker,
  createJumpingJackTrackerState,
  createLungeTrackerState,
  createPlankTrackerState,
  createPushupTrackerState,
  EXERCISE_PROFILES,
  getExerciseProfile,
  type ExerciseType,
} from "../motion-exercises";

function point(x: number, y: number, visibility = 0.95): MotionLandmark {
  return { x, y, z: 0, visibility };
}

describe("Exercise Engine (Fas H: Steg 71–75)", () => {
  describe("Exercise Profiles (Steg 75)", () => {
    it("defines comprehensive profiles for all 5 core exercises", () => {
      const types: ExerciseType[] = ["squat", "lunge", "pushup", "jumping-jacks", "plank"];
      for (const t of types) {
        const profile = getExerciseProfile(t);
        expect(profile.id).toBe(t);
        expect(profile.name.length).toBeGreaterThan(2);
        expect(profile.recommendedCameraAngle).toMatch(/front|side|diagonal/);
        expect(profile.targetJoints.length).toBeGreaterThan(0);
        expect(profile.cues.start).toBeDefined();
      }
    });

    it("specifies side camera angle for pushup, plank, and lunge", () => {
      expect(getExerciseProfile("pushup").recommendedCameraAngle).toBe("side");
      expect(getExerciseProfile("plank").recommendedCameraAngle).toBe("side");
      expect(getExerciseProfile("lunge").recommendedCameraAngle).toBe("side");
      expect(getExerciseProfile("squat").recommendedCameraAngle).toBe("front");
      expect(getExerciseProfile("jumping-jacks").recommendedCameraAngle).toBe("front");
    });
  });

  describe("Lunge Tracker (Steg 71)", () => {
    it("tracks lunge rep from standing to deep lunge and back to standing", () => {
      let tracker = createLungeTrackerState();

      // 1. Standing posture: knees extended (~170 deg)
      const standing = Array.from({ length: 33 }, () => point(0.5, 0.5));
      // Left leg: hip 23, knee 25, ankle 27
      standing[23] = point(0.45, 0.45);
      standing[25] = point(0.45, 0.70);
      standing[27] = point(0.45, 0.95);
      // Right leg: hip 24, knee 26, ankle 28
      standing[24] = point(0.55, 0.45);
      standing[26] = point(0.55, 0.70);
      standing[28] = point(0.55, 0.95);

      tracker = advanceLungeTracker(tracker, standing, 1000);
      expect(tracker.phase).toBe("standing");
      expect(tracker.reps).toBe(0);

      // 2. Descending: Front knee flexes to 105 deg
      const descending = Array.from({ length: 33 }, () => point(0.5, 0.5));
      descending[23] = point(0.40, 0.55);
      descending[25] = point(0.55, 0.75); // knee bent forward
      descending[27] = point(0.55, 0.95);
      descending[24] = point(0.40, 0.55);
      descending[26] = point(0.25, 0.75); // back knee bent back
      descending[28] = point(0.20, 0.95);

      tracker = advanceLungeTracker(tracker, descending, 1500);
      expect(tracker.phase).toBe("descending");

      // 3. Bottom position: Knee at 90 deg (femur horizontal)
      const bottom = Array.from({ length: 33 }, () => point(0.5, 0.5));
      bottom[23] = point(0.38, 0.75);
      bottom[25] = point(0.58, 0.75);
      bottom[27] = point(0.58, 0.95);
      bottom[24] = point(0.38, 0.75);
      bottom[26] = point(0.20, 0.85);
      bottom[28] = point(0.15, 0.95);

      tracker = advanceLungeTracker(tracker, bottom, 2000);
      expect(tracker.phase).toBe("bottom");

      // 4. Return to standing
      tracker = advanceLungeTracker(tracker, standing, 2700);
      expect(tracker.phase).toBe("standing");
      expect(tracker.reps).toBe(1);
      expect(tracker.leadLeg).toBe("left");
    });
  });

  describe("Push-up Tracker (Steg 72)", () => {
    it("counts a valid push-up with straight body line and deep elbow flexion", () => {
      let tracker = createPushupTrackerState();

      // Top plank: shoulder 11, elbow 13, wrist 15. Hip 23, ankle 27.
      const topPlank = Array.from({ length: 33 }, () => point(0.5, 0.5));
      topPlank[11] = point(0.3, 0.4); // shoulder
      topPlank[13] = point(0.3, 0.6); // elbow straight down
      topPlank[15] = point(0.3, 0.8); // wrist on floor
      topPlank[23] = point(0.55, 0.5); // hip aligned
      topPlank[27] = point(0.85, 0.8); // feet on floor

      tracker = advancePushupTracker(tracker, topPlank, 1000);
      expect(tracker.phase).toBe("plank-top");
      expect(tracker.bodyAlignmentDeg).toBeGreaterThan(150);

      // Bottom push-up: chest lowered, elbow angle <= 90 deg
      const bottomPushup = Array.from({ length: 33 }, () => point(0.5, 0.5));
      bottomPushup[11] = point(0.3, 0.7); // chest near floor
      bottomPushup[13] = point(0.2, 0.65); // elbow bent 90 deg
      bottomPushup[15] = point(0.3, 0.8); // hands on floor
      bottomPushup[23] = point(0.55, 0.72); // hips straight
      bottomPushup[27] = point(0.85, 0.8);

      tracker = advancePushupTracker(tracker, bottomPushup, 1800);
      expect(tracker.phase).toBe("bottom");

      // Back to top plank
      tracker = advancePushupTracker(tracker, topPlank, 2500);
      expect(tracker.phase).toBe("plank-top");
      expect(tracker.reps).toBe(1);
    });

    it("flags sagged hips (banana back) during pushup", () => {
      let tracker = createPushupTrackerState();

      // Sagged plank: hip drops down significantly below shoulder-ankle line
      const sagged = Array.from({ length: 33 }, () => point(0.5, 0.5));
      sagged[11] = point(0.3, 0.4);
      sagged[13] = point(0.3, 0.6);
      sagged[15] = point(0.3, 0.8);
      sagged[23] = point(0.55, 0.75); // excessive drop
      sagged[27] = point(0.85, 0.8);

      tracker = advancePushupTracker(tracker, sagged, 1000);
      expect(tracker.isFormWarning).toBe(true);
      expect(tracker.formMessage).toContain("höften");
    });
  });

  describe("Jumping Jacks Tracker (Steg 73)", () => {
    it("detects jumping jacks rep when arms and legs cycle open and closed", () => {
      let tracker = createJumpingJackTrackerState();

      // 1. Closed stance: arms down by hips, feet together
      const closed = Array.from({ length: 33 }, () => point(0.5, 0.5));
      closed[11] = point(0.45, 0.25); // shoulders
      closed[12] = point(0.55, 0.25);
      closed[15] = point(0.42, 0.55); // hands down
      closed[16] = point(0.58, 0.55);
      closed[27] = point(0.48, 0.92); // feet close
      closed[28] = point(0.52, 0.92);

      tracker = advanceJumpingJackTracker(tracker, closed, 1000);
      expect(tracker.phase).toBe("closed");
      expect(tracker.reps).toBe(0);

      // 2. Open stance: arms above shoulders, feet wide apart
      const open = Array.from({ length: 33 }, () => point(0.5, 0.5));
      open[11] = point(0.45, 0.25);
      open[12] = point(0.55, 0.25);
      open[15] = point(0.35, 0.12); // hands overhead
      open[16] = point(0.65, 0.12);
      open[27] = point(0.30, 0.92); // feet wide apart
      open[28] = point(0.70, 0.92);

      tracker = advanceJumpingJackTracker(tracker, open, 1400);
      expect(tracker.phase).toBe("open");

      // 3. Back to closed stance -> completes 1 rep
      tracker = advanceJumpingJackTracker(tracker, closed, 1800);
      expect(tracker.phase).toBe("closed");
      expect(tracker.reps).toBe(1);
    });
  });

  describe("Plank Hold Tracker (Steg 74)", () => {
    it("accumulates hold time when straight body line is maintained", () => {
      let tracker = createPlankTrackerState();

      const plank = Array.from({ length: 33 }, () => point(0.5, 0.5));
      plank[11] = point(0.3, 0.6); // shoulder
      plank[23] = point(0.55, 0.6); // hip
      plank[27] = point(0.85, 0.6); // ankle

      tracker = advancePlankTracker(tracker, plank, 1000);
      expect(tracker.isHolding).toBe(true);
      expect(tracker.holdTimeMs).toBe(0);

      tracker = advancePlankTracker(tracker, plank, 3500);
      expect(tracker.isHolding).toBe(true);
      expect(tracker.holdTimeMs).toBe(2500);
    });

    it("pauses hold timer when body line collapses (hips pike up)", () => {
      let tracker = createPlankTrackerState();

      const plank = Array.from({ length: 33 }, () => point(0.5, 0.5));
      plank[11] = point(0.3, 0.6);
      plank[23] = point(0.55, 0.6);
      plank[27] = point(0.85, 0.6);

      tracker = advancePlankTracker(tracker, plank, 1000);
      tracker = advancePlankTracker(tracker, plank, 3000);
      expect(tracker.holdTimeMs).toBe(2000);

      // Piked hips (butt sticks up high in the air)
      const piked = Array.from({ length: 33 }, () => point(0.5, 0.5));
      piked[11] = point(0.3, 0.6);
      piked[23] = point(0.55, 0.3); // way too high
      piked[27] = point(0.85, 0.6);

      tracker = advancePlankTracker(tracker, piked, 5000);
      expect(tracker.isHolding).toBe(false);
      // Timer should not have increased past the break
      expect(tracker.holdTimeMs).toBe(2000);
      expect(tracker.formWarning).toContain("rak linje");
    });
  });
});
