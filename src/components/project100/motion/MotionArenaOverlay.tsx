"use client";

import {
  CircleStop,
  Heart,
  Minimize,
  RefreshCw,
  Swords,
} from "lucide-react";
import React from "react";

import type { MotionArenaLanguage } from "@/lib/motion-announcer";
import {
  motionGameCountdown,
  motionGameSecondsRemaining,
  type MotionGameDifficulty,
  type MotionGameState,
} from "@/lib/motion-game";

export interface MotionArenaOverlayProps {
  gameView: MotionGameState | null;
  gameActive: boolean;
  arenaLanguage: MotionArenaLanguage;
  difficulty: MotionGameDifficulty;
  fullscreen: boolean;
  isLive: boolean;
  isRecovering: boolean;
  poseVisible: boolean;
  replaying: boolean;
  baselineRunning: boolean;
  performanceProfileRunning: boolean;
  squatTrackingEnabled: boolean;
  onStartGame: () => void;
  onStopGame: () => void;
  onToggleFullscreen: () => Promise<void> | void;
}

/**
 * Stage overlay for the Neon Guardian motion mini-game / bossfight.
 * Includes in-stage health hearts, combo counter, countdown, duck banners,
 * launch trigger button, and end-of-round score dialogue.
 */
export function MotionArenaOverlay({
  gameView,
  gameActive,
  arenaLanguage,
  difficulty,
  fullscreen,
  isLive,
  isRecovering,
  poseVisible,
  replaying,
  baselineRunning,
  performanceProfileRunning,
  squatTrackingEnabled,
  onStartGame,
  onStopGame,
  onToggleFullscreen,
}: MotionArenaOverlayProps): React.JSX.Element | null {
  const gameSeconds = gameView ? Math.ceil(motionGameSecondsRemaining(gameView)) : 0;

  return (
    <>
      {gameView && gameActive ? (
        <div className="p100-motion-game-hud">
          <div className="p100-motion-game-health" aria-label={`${gameView.hearts} liv kvar`}>
            <div className="hearts">
              {[0, 1, 2].map((heart) => (
                <Heart key={heart} className={heart < gameView.hearts ? "alive" : ""} />
              ))}
            </div>
          </div>
          <div className="p100-motion-game-stats">
            <div className="stat combo">
              <small>Combo</small>
              <strong>×{gameView.combo}</strong>
            </div>
            <div className="stat score">
              <small>{arenaLanguage === "sv" ? "Poäng" : "Score"}</small>
              <strong>
                {gameView.score.toLocaleString(arenaLanguage === "sv" ? "sv-SE" : "en-US")}
              </strong>
            </div>
            <div className="stat time">
              <small>{arenaLanguage === "sv" ? "Tid" : "Time"}</small>
              <strong>{gameSeconds}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {gameView?.status === "countdown" ? (
        <div className="p100-motion-countdown">
          <small>
            {arenaLanguage === "sv"
              ? "Gå till din plats · kalibrerar live"
              : "Take your position · live calibration"}
          </small>
          <strong>{motionGameCountdown(gameView)}</strong>
          <span>
            {arenaLanguage === "sv"
              ? "Slå målen. Ducka under den röda vågen."
              : "Strike targets. Duck under the red wave."}
          </span>
        </div>
      ) : null}

      {gameView?.duck ? (
        <div className={`p100-motion-duck-callout ${gameView.nowMs >= gameView.duck.activeAt ? "active" : ""}`}>
          <strong>
            {gameView.nowMs >= gameView.duck.activeAt
              ? arenaLanguage === "sv"
                ? "DUCKA!"
                : "DUCK!"
              : arenaLanguage === "sv"
              ? "GÖR DIG REDO"
              : "GET READY"}
          </strong>
        </div>
      ) : null}

      {isLive &&
      !isRecovering &&
      poseVisible &&
      !replaying &&
      !gameView &&
      !baselineRunning &&
      !performanceProfileRunning &&
      !squatTrackingEnabled ? (
        <button type="button" className="p100-motion-game-launch" onClick={onStartGame}>
          <Swords />{" "}
          {arenaLanguage === "sv"
            ? `Starta 60 s bossfight (${
                difficulty === "easy" ? "Lätt" : difficulty === "hard" ? "Svår" : "Medel"
              })`
            : `Start 60s Boss Fight (${
                difficulty === "easy" ? "Easy" : difficulty === "hard" ? "Hard" : "Medium"
              })`}
        </button>
      ) : null}

      {gameView?.status === "finished" ? (
        <div className="p100-motion-game-result" role="dialog" aria-label="Resultat från bossfight">
          <small>
            {gameView.finishReason === "hearts"
              ? arenaLanguage === "sv"
                ? "Neonväktaren vann den här gången"
                : "Neon Guardian won this round"
              : arenaLanguage === "sv"
              ? "Rundan klar"
              : "Round clear"}
          </small>
          <strong>
            {gameView.score.toLocaleString(arenaLanguage === "sv" ? "sv-SE" : "en-US")}{" "}
            {arenaLanguage === "sv" ? "poäng" : "pts"}
          </strong>
          <p>
            {gameView.hits} {arenaLanguage === "sv" ? "träffar" : "hits"} · {gameView.dodges}{" "}
            {arenaLanguage === "sv" ? "duckningar" : "dodges"} ·{" "}
            {arenaLanguage === "sv" ? "bästa combo" : "best combo"} ×{gameView.bestCombo}
          </p>
          <div className="p100-motion-game-result-actions">
            <button type="button" className="p100-motion-game-result-primary" onClick={onStartGame}>
              <RefreshCw /> {arenaLanguage === "sv" ? "Kör igen" : "Play again"}
            </button>
            {fullscreen ? (
              <button
                type="button"
                className="p100-motion-game-result-secondary fullscreen-exit"
                onClick={() => void onToggleFullscreen()}
                title={arenaLanguage === "sv" ? "Lämna helskärm" : "Exit fullscreen"}
                aria-label={arenaLanguage === "sv" ? "Avsluta helskärm" : "Exit fullscreen"}
              >
                <Minimize /> {arenaLanguage === "sv" ? "Avsluta helskärm" : "Exit fullscreen"}
              </button>
            ) : null}
            <button
              type="button"
              className="p100-motion-game-result-secondary"
              onClick={onStopGame}
              title={arenaLanguage === "sv" ? "Stäng rundan och gå tillbaka till labbet" : "Close round and return to lab"}
              aria-label={arenaLanguage === "sv" ? "Avsluta runda" : "Close round"}
            >
              <CircleStop /> {arenaLanguage === "sv" ? "Avsluta runda" : "Close round"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
