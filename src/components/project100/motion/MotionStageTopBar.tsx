"use client";

import {
  Gauge,
  Maximize,
  Minimize,
  Radio,
  Swords,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import React from "react";

import { baselineClock, remainingClock } from "./motion-formatting";
import { GATE_B_DURATION_MS } from "./motion-gate-b";

export interface MotionStageTopBarProps {
  isLive: boolean;
  isRecovering: boolean;
  delegate: string | null;
  poseExecutionMode: "worker" | "main-thread";
  replaying: boolean;
  gameActive: boolean;
  squatTrackingEnabled: boolean;
  squatReps: number;
  baselineRunning: boolean;
  baselineElapsedMs: number;
  performanceProfileRunning: boolean;
  performanceProfileMode: "quick" | "gate-b";
  performanceProfileElapsedMs: number;
  performanceProfileSecondsLeft: number;
  fullscreen: boolean;
  voiceGuidance: boolean;
  onStopGame: () => void;
  onToggleFullscreen: () => Promise<void> | void;
  onToggleVoiceGuidance: () => void;
}

/**
 * Top HUD banner overlaid on the video canvas inside the stage.
 * Shows status badges (Live, Engine, Replay, Game, Squat, Profiler)
 * and quick-action controls for Fullscreen and Voice Toggle.
 */
export function MotionStageTopBar({
  isLive,
  isRecovering,
  delegate,
  poseExecutionMode,
  replaying,
  gameActive,
  squatTrackingEnabled,
  squatReps,
  baselineRunning,
  baselineElapsedMs,
  performanceProfileRunning,
  performanceProfileMode,
  performanceProfileElapsedMs,
  performanceProfileSecondsLeft,
  fullscreen,
  voiceGuidance,
  onStopGame,
  onToggleFullscreen,
  onToggleVoiceGuidance,
}: MotionStageTopBarProps): React.JSX.Element {
  return (
    <div className="p100-motion-stage-top">
      <span className={`p100-motion-live ${isLive ? "active" : ""}`}>
        <Radio /> {isRecovering ? "Pose återansluter" : isLive ? "Kamera aktiv" : "Kamera av"}
      </span>
      {delegate ? (
        <span className="engine">
          {delegate} · {poseExecutionMode === "main-thread" ? "Mobilmotor" : "Worker"}
        </span>
      ) : null}
      {replaying ? <span className="replay">Replay</span> : null}
      {gameActive ? (
        <span className="game">
          <Swords /> Bossfight
        </span>
      ) : null}
      {squatTrackingEnabled ? (
        <span className="squat">
          <Gauge /> Squat Lab · {squatReps}
        </span>
      ) : null}
      {baselineRunning ? (
        <span className="baseline">
          <Gauge /> Baseline {baselineClock(baselineElapsedMs)}
        </span>
      ) : null}
      {performanceProfileRunning ? (
        <span className="profile">
          <Gauge />{" "}
          {performanceProfileMode === "gate-b"
            ? `Gate B ${remainingClock(GATE_B_DURATION_MS, performanceProfileElapsedMs)}`
            : `Profil ${performanceProfileSecondsLeft} s`}
        </span>
      ) : null}
      {gameActive ? (
        <button
          type="button"
          className="p100-motion-game-stop"
          onClick={onStopGame}
          title="Avsluta rundan"
          aria-label="Avsluta rundan"
        >
          <X />
        </button>
      ) : null}
      <button
        type="button"
        className="p100-motion-fullscreen"
        onClick={() => void onToggleFullscreen()}
        aria-label={fullscreen ? "Lämna helskärm" : "Visa i helskärm"}
        title={fullscreen ? "Lämna helskärm" : "Visa i helskärm"}
      >
        {fullscreen ? <Minimize /> : <Maximize />}
        <span>{fullscreen ? "Stäng" : "Helskärm"}</span>
      </button>
      <button
        type="button"
        className={`p100-motion-voice-toggle ${voiceGuidance ? "active" : ""}`}
        onClick={onToggleVoiceGuidance}
        aria-pressed={voiceGuidance}
        title={
          voiceGuidance
            ? "Stäng av röstguide och Arena-röst"
            : "Slå på röstguide och Arena-röst"
        }
      >
        {voiceGuidance ? <Volume2 /> : <VolumeX />}
        <span>Röst</span>
      </button>
    </div>
  );
}
