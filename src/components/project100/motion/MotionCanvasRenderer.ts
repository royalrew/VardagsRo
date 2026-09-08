import type { MotionArenaLanguage } from "@/lib/motion-announcer";
import {
  POSE_CONNECTIONS,
  type MotionPoseSnapshot,
} from "@/lib/motion-engine";
import type {
  MotionGameState,
  MotionGameTarget,
} from "@/lib/motion-game";
import {
  calculateProjectileDepth,
  interpolateProjectilePosition,
} from "@/lib/motion-projectiles";

/**
 * Draws the stabilized neon skeleton landmarks and connecting bones onto the 2D canvas overlay.
 */
export function drawSnapshot(canvas: HTMLCanvasElement, snapshot: MotionPoseSnapshot | null): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!snapshot || snapshot.landmarks.length === 0) return;

  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(2, canvas.width / 320);
  context.strokeStyle = "rgba(200, 244, 93, .88)";
  context.shadowBlur = 10;
  context.shadowColor = "rgba(200, 244, 93, .34)";

  for (const [fromIndex, toIndex] of POSE_CONNECTIONS) {
    const from = snapshot.landmarks[fromIndex];
    const to = snapshot.landmarks[toIndex];
    if (!from || !to || (from.visibility ?? 1) < 0.45 || (to.visibility ?? 1) < 0.45) continue;
    context.beginPath();
    context.moveTo(from.x * canvas.width, from.y * canvas.height);
    context.lineTo(to.x * canvas.width, to.y * canvas.height);
    context.stroke();
  }

  context.shadowBlur = 8;
  context.fillStyle = "#f1ffd0";
  for (const landmark of snapshot.landmarks) {
    if ((landmark.visibility ?? 1) < 0.45) continue;
    context.beginPath();
    context.arc(
      landmark.x * canvas.width,
      landmark.y * canvas.height,
      Math.max(2.5, canvas.width / 230),
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.shadowBlur = 0;
}

/**
 * Renders Neon Guardian targets, telegraph beams, lasers, and hit/dodge burst effects onto the 2D canvas overlay.
 */
export function drawMotionGame(
  canvas: HTMLCanvasElement,
  game: MotionGameState | null,
  nowMs: number,
  arenaLang: MotionArenaLanguage = "en",
): void {
  if (!game || game.status === "finished") return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.save();

  if (game.duck) {
    const active = nowMs >= game.duck.activeAt;
    const y = game.duck.thresholdY * canvas.height;
    const bandHeight = Math.max(13, canvas.height * 0.035);
    const gradient = context.createLinearGradient(0, y, canvas.width, y);
    gradient.addColorStop(0, "rgba(255, 91, 91, 0)");
    gradient.addColorStop(0.18, active ? "rgba(255, 91, 91, .75)" : "rgba(255, 194, 92, .55)");
    gradient.addColorStop(0.82, active ? "rgba(255, 91, 91, .75)" : "rgba(255, 194, 92, .55)");
    gradient.addColorStop(1, "rgba(255, 91, 91, 0)");
    context.fillStyle = gradient;
    context.shadowBlur = active ? 24 : 12;
    context.shadowColor = active ? "rgba(255, 70, 70, .8)" : "rgba(255, 194, 92, .6)";
    context.fillRect(0, y - bandHeight / 2, canvas.width, bandHeight);
  }

  // Om båda målen i en dual strike är aktiva, rita en neon-laserkoppling mellan dem
  if (game.target && game.secondaryTarget && game.target.kind === "dual") {
    const ax = game.target.x * canvas.width;
    const ay = game.target.y * canvas.height;
    const bx = game.secondaryTarget.x * canvas.width;
    const by = game.secondaryTarget.y * canvas.height;
    const isArming = Boolean(game.target.activeAt && nowMs < game.target.activeAt);
    context.save();
    context.strokeStyle = isArming ? "rgba(255, 210, 80, 0.85)" : "rgba(255, 120, 240, 0.75)";
    context.shadowBlur = isArming ? 24 : 18;
    context.shadowColor = isArming ? "rgba(255, 190, 50, 0.95)" : "rgba(255, 100, 230, 0.85)";
    context.lineWidth = Math.max(3, canvas.height / 200);
    context.setLineDash(isArming ? [4, 4] : [8, 8]);
    context.beginPath();
    context.moveTo(ax, ay);
    context.lineTo(bx, by);
    context.stroke();
    context.restore();
  }

  const renderSingleTarget = (tgt: MotionGameTarget, isSecondary = false) => {
    const x = tgt.x * canvas.width;
    const y = tgt.y * canvas.height;
    const baseRadius = tgt.radius * canvas.height;
    const pulse = 1 + Math.sin((nowMs - tgt.spawnedAt) / 85) * 0.08;
    const life = Math.max(0, (tgt.expiresAt - nowMs) / (tgt.expiresAt - tgt.spawnedAt));

    const isKick = tgt.kind === "kick";
    const isDual = tgt.kind === "dual";
    const isArming = Boolean(tgt.activeAt && nowMs < tgt.activeAt);

    context.save();
    if (isKick) {
      context.shadowBlur = 32;
      context.shadowColor = "rgba(255, 200, 50, 0.9)";
      context.fillStyle = "rgba(120, 80, 10, 0.78)";
      context.strokeStyle = "#ffd040";
    } else if (isDual) {
      context.shadowBlur = 32;
      context.shadowColor = isArming
        ? "rgba(255, 200, 80, 0.9)"
        : isSecondary
          ? "rgba(255, 100, 230, 0.9)"
          : "rgba(100, 210, 255, 0.9)";
      context.fillStyle = isArming
        ? "rgba(70, 50, 10, 0.78)"
        : isSecondary
          ? "rgba(110, 20, 95, 0.78)"
          : "rgba(19, 84, 105, 0.78)";
      context.strokeStyle = isArming ? "#ffd040" : isSecondary ? "#ff88ec" : "#7de8ff";
    } else {
      context.shadowBlur = 30;
      context.shadowColor = "rgba(82, 224, 255, .8)";
      context.fillStyle = "rgba(19, 84, 105, .72)";
      context.strokeStyle = "#7de8ff";
    }

    context.lineWidth = Math.max(3, canvas.height / 180);
    context.beginPath();
    context.arc(x, y, baseRadius * pulse, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.shadowBlur = 12;
    context.fillStyle = isKick ? "#fff8db" : isDual && isSecondary ? "#ffe8fb" : "#e5fbff";
    context.beginPath();
    context.arc(x, y, baseRadius * 0.28, 0, Math.PI * 2);
    context.fill();

    context.shadowBlur = 0;
    context.strokeStyle = isKick
      ? "rgba(255, 208, 64, 0.55)"
      : isDual && isSecondary
        ? "rgba(255, 136, 236, 0.55)"
        : "rgba(125, 232, 255, .5)";
    context.lineWidth = Math.max(2, canvas.height / 260);
    context.beginPath();
    context.arc(x, y, baseRadius * 1.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * life);
    context.stroke();

    context.fillStyle = "rgba(229, 251, 255, .92)";
    context.font = `800 ${Math.max(11, canvas.height / 42)}px system-ui`;
    context.textAlign = "center";
    context.textBaseline = "middle";

    let movementLabel = "";
    if (isKick) {
      movementLabel = arenaLang === "sv" ? "SPARKA" : "KICK";
    } else if (isDual) {
      if (isArming) {
        movementLabel = arenaLang === "sv" ? "REDO!" : "READY!";
      } else if (tgt.requiredLimb === "leftHand") {
        movementLabel = arenaLang === "sv" ? "VÄNSTER!" : "LEFT!";
      } else if (tgt.requiredLimb === "rightHand") {
        movementLabel = arenaLang === "sv" ? "HÖGER!" : "RIGHT!";
      } else {
        movementLabel = arenaLang === "sv" ? "BÅDA" : "DUAL";
      }
    } else {
      movementLabel =
        arenaLang === "sv"
          ? (tgt.kind === "low" ? "NER" : tgt.kind === "high" ? "UPP" : "SIDAN")
          : (tgt.kind === "low" ? "DOWN" : tgt.kind === "high" ? "UP" : "SIDE");
    }

    // Canvasen spegelvänds tillsammans med kameran. Spegelvänd texten en gång här
    // så att den blir rättvänd efter canvasens CSS-transform.
    context.save();
    context.translate(x, 0);
    context.scale(-1, 1);
    context.fillText(movementLabel, 0, y + baseRadius * 1.7);
    context.restore();
    context.restore();
  };

  if (game.target) renderSingleTarget(game.target, false);
  if (game.secondaryTarget) renderSingleTarget(game.secondaryTarget, true);

  if (game.projectiles && game.projectiles.length > 0) {
    for (const proj of game.projectiles) {
      if (proj.state !== "flying") continue;
      const depth = calculateProjectileDepth(proj, nowMs);
      const pos = interpolateProjectilePosition(proj, depth.progressZ);

      const x = pos.x * canvas.width;
      const y = pos.y * canvas.height;
      const radius = depth.radius * canvas.height;
      const pulse = 1 + Math.sin((nowMs - proj.spawnedAt) / 60) * 0.09;

      context.save();

      // Svanspartiklar / Rörelsevektor från startpunkt mot mål
      const sx = proj.startX * canvas.width;
      const sy = proj.startY * canvas.height;
      context.beginPath();
      context.moveTo(sx, sy);
      context.lineTo(x, y);
      context.strokeStyle =
        proj.kind === "hazard-bomb"
          ? "rgba(230, 40, 90, 0.28)"
          : proj.kind === "kick-projectile"
          ? "rgba(255, 200, 40, 0.28)"
          : proj.kind === "energy-orb"
          ? "rgba(60, 220, 255, 0.28)"
          : "rgba(255, 100, 30, 0.28)";
      context.lineWidth = Math.max(2, radius * 0.2);
      context.setLineDash([6, 6]);
      context.stroke();

      // Olika styling per projektiltyp
      if (proj.kind === "hazard-bomb") {
        // Taggig hazard-bomb
        context.shadowBlur = depth.inSweetSpot ? 36 : 20;
        context.shadowColor = "rgba(255, 30, 90, 0.95)";
        context.fillStyle = "rgba(100, 10, 30, 0.85)";
        context.strokeStyle = "#ff2a55";
        context.lineWidth = Math.max(3, canvas.height / 170);

        context.beginPath();
        context.arc(x, y, radius * pulse, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        // Kryss / varningssymbol
        context.strokeStyle = "#ffffff";
        context.lineWidth = Math.max(2, radius * 0.25);
        context.beginPath();
        const cr = radius * 0.45;
        context.moveTo(x - cr, y - cr);
        context.lineTo(x + cr, y + cr);
        context.moveTo(x + cr, y - cr);
        context.lineTo(x - cr, y + cr);
        context.stroke();
      } else if (proj.kind === "kick-projectile") {
        // Låg spark-projektil
        context.shadowBlur = depth.inSweetSpot ? 36 : 22;
        context.shadowColor = "rgba(255, 210, 40, 0.95)";
        context.fillStyle = "rgba(120, 80, 10, 0.82)";
        context.strokeStyle = "#ffd040";
        context.lineWidth = Math.max(3, canvas.height / 170);

        context.beginPath();
        context.arc(x, y, radius * pulse, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        // Kärna
        context.fillStyle = "#fff8db";
        context.beginPath();
        context.arc(x, y, radius * 0.35, 0, Math.PI * 2);
        context.fill();
      } else {
        // Eldklot / Energiklot
        const isEnergy = proj.kind === "energy-orb";
        context.shadowBlur = depth.inSweetSpot ? 36 : 22;
        context.shadowColor = isEnergy ? "rgba(60, 220, 255, 0.95)" : "rgba(255, 110, 30, 0.95)";
        context.fillStyle = isEnergy ? "rgba(10, 70, 110, 0.82)" : "rgba(120, 35, 10, 0.82)";
        context.strokeStyle = isEnergy ? "#60d8ff" : "#ff7030";
        context.lineWidth = Math.max(3, canvas.height / 170);

        context.beginPath();
        context.arc(x, y, radius * pulse, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        // Inre ljus kärna
        context.fillStyle = isEnergy ? "#dcf7ff" : "#fff1dc";
        context.beginPath();
        context.arc(x, y, radius * 0.35, 0, Math.PI * 2);
        context.fill();
      }

      // SWEET SPOT RETICLE ("Träffplan")
      if (depth.inSweetSpot) {
        context.save();
        context.strokeStyle = proj.kind === "hazard-bomb" ? "#ff1a40" : "#00ffcc";
        context.shadowColor = proj.kind === "hazard-bomb" ? "rgba(255, 20, 50, 0.9)" : "rgba(0, 255, 200, 0.9)";
        context.shadowBlur = 24;
        context.lineWidth = Math.max(3, canvas.height / 150);
        context.beginPath();
        context.arc(x, y, radius * 1.5, 0, Math.PI * 2);
        context.stroke();

        // Spegelvänd textcue vid sweet spot så den blir rättvänd efter CSS-transform
        context.font = `bold ${Math.round(canvas.height / 32)}px system-ui, -apple-system, sans-serif`;
        context.fillStyle = proj.kind === "hazard-bomb" ? "#ff4060" : "#aaffef";
        context.textAlign = "center";
        const label =
          proj.kind === "hazard-bomb"
            ? arenaLang === "sv"
              ? "DUCKA / UNDVIK!"
              : "DODGE!"
            : proj.kind === "kick-projectile"
            ? arenaLang === "sv"
              ? "SPARKA NU!"
              : "KICK NOW!"
            : arenaLang === "sv"
            ? "SLÅ NU!"
            : "STRIKE NOW!";

        context.save();
        context.translate(x, 0);
        context.scale(-1, 1);
        context.fillText(label, 0, y - radius * 1.6);
        context.restore();

        context.restore();
      }

      context.restore();
    }
  }

  if (game.effect && nowMs - game.effect.at < 480) {
    const age = (nowMs - game.effect.at) / 480;
    const radius = canvas.height * (0.045 + age * 0.14);
    const color =
      game.effect.type === "damage" || game.effect.type === "miss"
        ? `rgba(255, 100, 91, ${1 - age})`
        : game.effect.type === "duck"
          ? `rgba(200, 244, 93, ${1 - age})`
          : game.effect.type === "kick"
            ? `rgba(255, 208, 64, ${1 - age})`
            : game.effect.type === "double"
              ? `rgba(255, 120, 240, ${1 - age})`
              : `rgba(125, 232, 255, ${1 - age})`;
    context.strokeStyle = color;
    context.lineWidth = Math.max(3, canvas.height / 150) * (1 - age * 0.6);
    context.beginPath();
    context.arc(game.effect.x * canvas.width, game.effect.y * canvas.height, radius, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}
