import { describe, expect, it } from "vitest";
import {
  createProjectile,
  advanceProjectiles,
  resolveProjectileInteractions,
  calculateProjectileDepth,
  interpolateProjectilePosition,
  type MotionGameProjectile,
  type MotionProjectileLimbAction,
} from "../motion-projectiles";

describe("motion-projectiles (Vision RPG 3D Interception Defence)", () => {
  it("interpolates projectile trajectory and exponential 3D radius scaling", () => {
    const proj = createProjectile({
      id: 1,
      kind: "fireball",
      startX: 0.5,
      startY: 0.2,
      targetX: 0.8,
      targetY: 0.6,
      spawnedAt: 1000,
      sweetSpotAt: 2000,
      baseRadius: 0.06,
    });

    // At spawn (t = 1000)
    const depthStart = calculateProjectileDepth(proj, 1000);
    expect(depthStart.progressZ).toBeCloseTo(0.0, 2);
    expect(depthStart.radius).toBeCloseTo(0.06 * 0.25, 3);
    const posStart = interpolateProjectilePosition(proj, depthStart.progressZ);
    expect(posStart.x).toBeCloseTo(0.5, 2);
    expect(posStart.y).toBeCloseTo(0.2, 2);

    // At sweet spot (t = 2000)
    const depthSweet = calculateProjectileDepth(proj, 2000);
    expect(depthSweet.progressZ).toBeCloseTo(1.0, 2);
    expect(depthSweet.radius).toBeCloseTo(0.06, 3);
    const posSweet = interpolateProjectilePosition(proj, depthSweet.progressZ);
    expect(posSweet.x).toBeCloseTo(0.8, 2);
    expect(posSweet.y).toBeCloseTo(0.6, 2);

    // Mid-flight (t = 1500, progressZ = 0.5)
    const depthMid = calculateProjectileDepth(proj, 1500);
    expect(depthMid.progressZ).toBeCloseTo(0.5, 2);
    // 0.06 * (0.25 + 0.75 * 0.25) = 0.06 * 0.4375 = 0.02625
    expect(depthMid.radius).toBeCloseTo(0.02625, 4);
    const posMid = interpolateProjectilePosition(proj, depthMid.progressZ);
    expect(posMid.x).toBeCloseTo(0.65, 2);
    expect(posMid.y).toBeCloseTo(0.40, 2);
  });

  it("identifies too-early interception when striking before sweet spot window", () => {
    const proj = createProjectile({
      id: 1,
      kind: "fireball",
      startX: 0.5,
      startY: 0.2,
      targetX: 0.7,
      targetY: 0.5,
      spawnedAt: 1000,
      sweetSpotAt: 2000,
      baseRadius: 0.06,
    });

    // Strike at t = 1400 (progressZ = 0.40 < 0.80)
    const handAction: MotionProjectileLimbAction = {
      limb: "rightHand",
      point: { x: 0.58, y: 0.32 }, // directly on trajectory
    };

    const outcome = resolveProjectileInteractions([proj], [handAction], 1400);
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events[0].outcome).toBe("too-early");
    expect(outcome.activeProjectiles[0].state).toBe("flying"); // still active!
    expect(outcome.scoreBonus).toBe(0);
  });

  it("parries fireball in sweet spot and inflicts damage on boss", () => {
    const proj = createProjectile({
      id: 1,
      kind: "fireball",
      startX: 0.5,
      startY: 0.2,
      targetX: 0.7,
      targetY: 0.5,
      spawnedAt: 1000,
      sweetSpotAt: 2000,
      baseRadius: 0.06,
    });

    // Strike in sweet spot at t = 1950 (progressZ = 0.95 in [0.82, 1.08])
    const handAction: MotionProjectileLimbAction = {
      limb: "rightHand",
      point: { x: 0.69, y: 0.49 }, // on target
    };

    const outcome = resolveProjectileInteractions([proj], [handAction], 1950);
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events[0].outcome).toBe("parried");
    expect(outcome.events[0].projectileId).toBe(1);
    expect(outcome.scoreBonus).toBeGreaterThanOrEqual(200);
    expect(outcome.damageToBoss).toBeGreaterThanOrEqual(100);
    expect(outcome.activeProjectiles).toHaveLength(0); // consumed/destroyed
  });

  it("requires foot/knee for kick-projectile and rejects punches", () => {
    const proj = createProjectile({
      id: 2,
      kind: "kick-projectile",
      startX: 0.5,
      startY: 0.2,
      targetX: 0.4,
      targetY: 0.75, // low target
      spawnedAt: 1000,
      sweetSpotAt: 2000,
      baseRadius: 0.07,
    });

    // Hand punch attempt at sweet spot
    const handPunch: MotionProjectileLimbAction = {
      limb: "leftHand",
      point: { x: 0.40, y: 0.75 },
    };
    const punchOutcome = resolveProjectileInteractions([proj], [handPunch], 2000);
    expect(punchOutcome.events).toHaveLength(1);
    expect(punchOutcome.events[0].outcome).toBe("wrong-limb");
    expect(punchOutcome.activeProjectiles[0].state).toBe("flying");

    // Foot kick attempt at sweet spot
    const footKick: MotionProjectileLimbAction = {
      limb: "leftFoot",
      point: { x: 0.40, y: 0.75 },
    };
    const kickOutcome = resolveProjectileInteractions([proj], [footKick], 2000);
    expect(kickOutcome.events).toHaveLength(1);
    expect(kickOutcome.events[0].outcome).toBe("parried");
    expect(kickOutcome.damageToBoss).toBeGreaterThanOrEqual(150);
  });

  it("hazard-bomb damages player on contact but grants dodge bonus if avoided", () => {
    const bomb = createProjectile({
      id: 3,
      kind: "hazard-bomb",
      startX: 0.5,
      startY: 0.2,
      targetX: 0.5,
      targetY: 0.4,
      spawnedAt: 1000,
      sweetSpotAt: 2000,
      baseRadius: 0.08,
    });

    // If player strikes the bomb
    const strikeAction: MotionProjectileLimbAction = {
      limb: "leftHand",
      point: { x: 0.5, y: 0.4 },
    };
    const strikeOutcome = resolveProjectileInteractions([bomb], [strikeAction], 2000);
    expect(strikeOutcome.events[0].outcome).toBe("hazard-detonated");
    expect(strikeOutcome.damageToPlayer).toBe(1);

    // If player dodges and bomb safely passes z > 1.10 without collision
    const dodgeOutcome = advanceProjectiles([bomb], 2250); // t = 2250 -> progressZ = 1.25
    expect(dodgeOutcome.events).toHaveLength(1);
    expect(dodgeOutcome.events[0].outcome).toBe("dodged");
    expect(dodgeOutcome.scoreBonus).toBeGreaterThan(0);
    expect(dodgeOutcome.damageToPlayer).toBe(0);
  });

  it("inflicts damage on player when unparried attack reaches impact threshold", () => {
    const unparried = createProjectile({
      id: 4,
      kind: "energy-orb",
      startX: 0.5,
      startY: 0.2,
      targetX: 0.3,
      targetY: 0.3,
      spawnedAt: 1000,
      sweetSpotAt: 2000,
      baseRadius: 0.06,
    });

    // Time passes past impact (t = 2200 -> progressZ = 1.20)
    const result = advanceProjectiles([unparried], 2200);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].outcome).toBe("impacted");
    expect(result.damageToPlayer).toBe(1);
    expect(result.activeProjectiles).toHaveLength(0);
  });
});
