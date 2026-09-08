export type MotionProjectileKind =
  | "fireball"
  | "energy-orb"
  | "kick-projectile"
  | "hazard-bomb";

export interface MotionGameProjectile {
  id: number;
  kind: MotionProjectileKind;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  spawnedAt: number;
  sweetSpotAt: number;
  baseRadius: number;
  state: "flying" | "parried" | "impacted" | "dodged";
}

export interface MotionProjectileLimbAction {
  limb: "leftHand" | "rightHand" | "leftFoot" | "rightFoot" | "leftKnee" | "rightKnee";
  point: { x: number; y: number };
}

export type MotionProjectileOutcome =
  | "too-early"
  | "parried"
  | "wrong-limb"
  | "hazard-detonated"
  | "dodged"
  | "impacted";

export interface MotionProjectileEvent {
  projectileId: number;
  outcome: MotionProjectileOutcome;
  point: { x: number; y: number };
  kind: MotionProjectileKind;
}

export interface MotionProjectileResolution {
  activeProjectiles: MotionGameProjectile[];
  events: MotionProjectileEvent[];
  damageToBoss: number;
  damageToPlayer: number;
  scoreBonus: number;
}

export function createProjectile(
  params: Omit<MotionGameProjectile, "state">,
): MotionGameProjectile {
  return {
    ...params,
    state: "flying",
  };
}

/**
 * Calculates current progress along the 3D depth vector (z) and exponential perspective radius.
 */
export function calculateProjectileDepth(
  proj: MotionGameProjectile,
  nowMs: number,
): {
  progressZ: number;
  radius: number;
  inSweetSpot: boolean;
} {
  const duration = Math.max(1, proj.sweetSpotAt - proj.spawnedAt);
  const progressZ = (nowMs - proj.spawnedAt) / duration;
  const clampedZ = Math.min(1.25, Math.max(0, progressZ));
  const radius = proj.baseRadius * (0.25 + 0.75 * clampedZ * clampedZ);
  const inSweetSpot = progressZ >= 0.82 && progressZ <= 1.08;

  return {
    progressZ,
    radius,
    inSweetSpot,
  };
}

/**
 * Interpolates (x, y) coordinates from origin towards target based on z depth.
 */
export function interpolateProjectilePosition(
  proj: MotionGameProjectile,
  progressZ: number,
): { x: number; y: number } {
  const z = Math.min(1.2, Math.max(0, progressZ));
  return {
    x: proj.startX + (proj.targetX - proj.startX) * z,
    y: proj.startY + (proj.targetY - proj.startY) * z,
  };
}

function isLowerBodyLimb(limb: MotionProjectileLimbAction["limb"]): boolean {
  return (
    limb === "leftFoot" ||
    limb === "rightFoot" ||
    limb === "leftKnee" ||
    limb === "rightKnee"
  );
}

/**
 * Evaluates physical limb strikes against incoming projectiles.
 */
export function resolveProjectileInteractions(
  projectiles: readonly MotionGameProjectile[],
  actions: readonly MotionProjectileLimbAction[],
  nowMs: number,
): MotionProjectileResolution {
  const active: MotionGameProjectile[] = [];
  const events: MotionProjectileEvent[] = [];
  let damageToBoss = 0;
  let damageToPlayer = 0;
  let scoreBonus = 0;

  for (const proj of projectiles) {
    if (proj.state !== "flying") continue;

    const depth = calculateProjectileDepth(proj, nowMs);
    const pos = interpolateProjectilePosition(proj, depth.progressZ);

    let resolved = false;

    for (const act of actions) {
      const dist = Math.hypot(pos.x - act.point.x, pos.y - act.point.y);
      const hitRadius = depth.radius * 1.35; // Generous hit registration box

      if (dist <= hitRadius) {
        if (proj.kind === "hazard-bomb") {
          // Detonates and damages player
          damageToPlayer += 1;
          events.push({
            projectileId: proj.id,
            outcome: "hazard-detonated",
            point: pos,
            kind: proj.kind,
          });
          resolved = true;
          break;
        }

        if (depth.progressZ < 0.82) {
          // Too early! Projectile still in distant 3D space
          events.push({
            projectileId: proj.id,
            outcome: "too-early",
            point: act.point,
            kind: proj.kind,
          });
          // Do not consume projectile; continues flying
          break;
        }

        if (depth.inSweetSpot) {
          if (proj.kind === "kick-projectile") {
            if (!isLowerBodyLimb(act.limb)) {
              events.push({
                projectileId: proj.id,
                outcome: "wrong-limb",
                point: act.point,
                kind: proj.kind,
              });
              break;
            }
            // Parried by kick
            damageToBoss += 180;
            scoreBonus += 280;
            events.push({
              projectileId: proj.id,
              outcome: "parried",
              point: pos,
              kind: proj.kind,
            });
            resolved = true;
            break;
          }

          // Fireball or energy-orb parried
          damageToBoss += 150;
          scoreBonus += 250;
          events.push({
            projectileId: proj.id,
            outcome: "parried",
            point: pos,
            kind: proj.kind,
          });
          resolved = true;
          break;
        }
      }
    }

    if (!resolved) {
      active.push(proj);
    }
  }

  return {
    activeProjectiles: active,
    events,
    damageToBoss,
    damageToPlayer,
    scoreBonus,
  };
}

/**
 * Advances flight state and detects expired/impacted projectiles.
 */
export function advanceProjectiles(
  projectiles: readonly MotionGameProjectile[],
  nowMs: number,
): MotionProjectileResolution {
  const active: MotionGameProjectile[] = [];
  const events: MotionProjectileEvent[] = [];
  let damageToPlayer = 0;
  let scoreBonus = 0;

  for (const proj of projectiles) {
    if (proj.state !== "flying") continue;

    const depth = calculateProjectileDepth(proj, nowMs);
    const pos = interpolateProjectilePosition(proj, depth.progressZ);

    if (depth.progressZ > 1.10) {
      if (proj.kind === "hazard-bomb") {
        // Player successfully avoided the hazard
        scoreBonus += 150;
        events.push({
          projectileId: proj.id,
          outcome: "dodged",
          point: pos,
          kind: proj.kind,
        });
      } else {
        // Unparried projectile hits player!
        damageToPlayer += 1;
        events.push({
          projectileId: proj.id,
          outcome: "impacted",
          point: pos,
          kind: proj.kind,
        });
      }
    } else {
      active.push(proj);
    }
  }

  return {
    activeProjectiles: active,
    events,
    damageToBoss: 0,
    damageToPlayer,
    scoreBonus,
  };
}
