import { describe, expect, it } from "vitest";
import {
  detectCameraPitch,
  detectUserOrientation,
  evaluateExerciseFraming,
  computeJointAngle3D,
} from "../motion-camera-coach";
import type { MotionLandmark } from "../motion-engine";

function createMockLandmark(x: number, y: number, z = 0, visibility = 1): MotionLandmark {
  return { x, y, z, visibility };
}

function createBaseBodyLandmarks(): MotionLandmark[] {
  const lm: MotionLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    lm.push(createMockLandmark(0.5, 0.5, 0));
  }
  // Standard standing human
  lm[0] = createMockLandmark(0.5, 0.15, 0); // Nose / head
  lm[11] = createMockLandmark(0.42, 0.28, 0); // Left shoulder
  lm[12] = createMockLandmark(0.58, 0.28, 0); // Right shoulder
  lm[13] = createMockLandmark(0.40, 0.45, 0); // Left elbow
  lm[14] = createMockLandmark(0.60, 0.45, 0); // Right elbow
  lm[15] = createMockLandmark(0.40, 0.65, 0); // Left wrist
  lm[16] = createMockLandmark(0.60, 0.65, 0); // Right wrist
  lm[23] = createMockLandmark(0.45, 0.55, 0); // Left hip
  lm[24] = createMockLandmark(0.55, 0.55, 0); // Right hip
  lm[25] = createMockLandmark(0.45, 0.75, 0); // Left knee
  lm[26] = createMockLandmark(0.55, 0.75, 0); // Right knee
  lm[27] = createMockLandmark(0.45, 0.95, 0); // Left ankle
  lm[28] = createMockLandmark(0.55, 0.95, 0); // Right ankle
  lm[31] = createMockLandmark(0.45, 0.98, 0); // Left toe
  lm[32] = createMockLandmark(0.55, 0.98, 0); // Right toe
  return lm;
}

describe("motion-camera-coach: Camera Pitch & Placement", () => {
  it("detects low camera tilted upward (typical iPhone on TV bench / floor)", () => {
    const lm = createBaseBodyLandmarks();
    // When camera is low looking UP, upper body is perspective-foreshortened relative to lower body
    // Lower body (ankles to hips) spans large y delta, torso (hips to nose) spans small delta
    lm[0] = createMockLandmark(0.5, 0.35); // Head compressed down
    lm[11] = createMockLandmark(0.44, 0.42);
    lm[12] = createMockLandmark(0.56, 0.42);
    lm[23] = createMockLandmark(0.45, 0.52); // Torso only 0.17 height
    lm[24] = createMockLandmark(0.55, 0.52);
    lm[27] = createMockLandmark(0.45, 0.96); // Legs span 0.44 height
    lm[28] = createMockLandmark(0.55, 0.96);

    const pitch = detectCameraPitch(lm);
    expect(pitch.placement).toBe("low-upward");
    expect(pitch.isPitchTilted).toBe(true);
  });

  it("detects eye-level camera when body proportions match standard projection", () => {
    const lm = createBaseBodyLandmarks();
    const pitch = detectCameraPitch(lm);
    expect(pitch.placement).toBe("eye-level");
    expect(pitch.isPitchTilted).toBe(false);
  });
});

describe("motion-camera-coach: User Stance Orientation", () => {
  it("detects front-facing stance when shoulders and hips have little z-depth difference", () => {
    const lm = createBaseBodyLandmarks();
    // Both shoulders have z near 0
    lm[11].z = 0.02;
    lm[12].z = -0.02;
    const orientation = detectUserOrientation(lm);
    expect(orientation.stance).toBe("front");
    expect(orientation.estimatedYawDegrees).toBeLessThan(25);
  });

  it("detects diagonal 45-degree stance (typical living room compromise)", () => {
    const lm = createBaseBodyLandmarks();
    // 45 degree rotation: depth delta and width delta are balanced
    lm[11].z = 0.08;
    lm[12].z = -0.08;
    lm[23].z = 0.08;
    lm[24].z = -0.08;
    lm[11].x = 0.44;
    lm[12].x = 0.56;

    const orientation = detectUserOrientation(lm);
    expect(orientation.stance).toBe("diagonal");
    expect(orientation.estimatedYawDegrees).toBeGreaterThanOrEqual(25);
    expect(orientation.estimatedYawDegrees).toBeLessThanOrEqual(65);
  });

  it("detects profile 90-degree side stance", () => {
    const lm = createBaseBodyLandmarks();
    // One shoulder directly behind the other in x-plane
    lm[11].x = 0.49;
    lm[12].x = 0.51;
    lm[11].z = 0.22;
    lm[12].z = -0.22;

    const orientation = detectUserOrientation(lm);
    expect(orientation.stance).toBe("profile");
    expect(orientation.estimatedYawDegrees).toBeGreaterThan(65);
  });
});

describe("motion-camera-coach: Exercise Framing & Actionable Feedback", () => {
  it("warns about insufficient headroom for overhead press", () => {
    const lm = createBaseBodyLandmarks();
    // Head already near top of frame (y=0.06), wrists at lockout will be clipped
    lm[0] = createMockLandmark(0.5, 0.05);

    const feedback = evaluateExerciseFraming(lm, "overhead-press");
    expect(feedback.isOptimal).toBe(false);
    expect(feedback.issues).toContain("overhead-clipped");
    expect(feedback.advice).toMatch(/backa|vinkla upp/i);
  });

  it("warns when feet or floor are clipped for squats or calf raises", () => {
    const lm = createBaseBodyLandmarks();
    // Ankles off screen (> 0.98)
    lm[27] = createMockLandmark(0.45, 0.99);
    lm[28] = createMockLandmark(0.55, 0.99);

    const feedback = evaluateExerciseFraming(lm, "calf-raise");
    expect(feedback.isOptimal).toBe(false);
    expect(feedback.issues).toContain("feet-clipped");
    expect(feedback.advice).toMatch(/fötterna|golvet/i);
  });

  it("warns when user stands flat front-facing for kettlebell swing and recommends turning", () => {
    const lm = createBaseBodyLandmarks();
    lm[11].z = 0;
    lm[12].z = 0; // Dead front

    const feedback = evaluateExerciseFraming(lm, "kettlebell-swing");
    expect(feedback.isOptimal).toBe(false);
    expect(feedback.issues).toContain("suboptimal-angle");
    expect(feedback.advice).toMatch(/profil|snett/i);
  });

  it("requires a profile or diagonal view for RDL and Bulgarian split squats", () => {
    const lm = createBaseBodyLandmarks();

    expect(evaluateExerciseFraming(lm, "dumbbell-rdl").issues).toContain("suboptimal-angle");
    expect(evaluateExerciseFraming(lm, "bulgarian-split-squat").issues).toContain("suboptimal-angle");
  });

  it("confirms optimal framing when user is well positioned", () => {
    const lm = createBaseBodyLandmarks();
    const feedback = evaluateExerciseFraming(lm, "bicep-curl");
    expect(feedback.isOptimal).toBe(true);
    expect(feedback.advice).toMatch(/bra|optimal/i);
  });
});

describe("motion-camera-coach: 3D View-Invariant Angle Computation", () => {
  it("computes identical joint angle in 3D whether viewed from front or diagonal", () => {
    // 90-degree elbow bent in sagittal plane (profile)
    const shoulder = createMockLandmark(0.5, 0.3, 0);
    const elbow = createMockLandmark(0.5, 0.5, 0);
    const wristProfile = createMockLandmark(0.5, 0.5, 0.2); // Forearm sticking straight out in z (+0.2)

    const angleProfile = computeJointAngle3D(shoulder, elbow, wristProfile);
    expect(angleProfile).toBeCloseTo(90, 0);

    // Same arm rotated 45 degrees into diagonal view:
    // Wrist x moves by 0.2 * cos(45°) ~ 0.141, z moves by 0.2 * sin(45°) ~ 0.141
    const wristDiagonal = createMockLandmark(0.5 + 0.141, 0.5, 0.141);
    const angleDiagonal = computeJointAngle3D(shoulder, elbow, wristDiagonal);

    // In 3D, the joint angle between the bones is still exactly 90 degrees!
    expect(angleDiagonal).toBeCloseTo(90, 0);
  });
});
