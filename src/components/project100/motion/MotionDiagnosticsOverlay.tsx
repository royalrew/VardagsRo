"use client";

import {
  Check,
  CircleStop,
  Copy,
  Download,
  Gauge,
  Play,
  X,
} from "lucide-react";
import React from "react";

import {
  MOTION_BASELINE_PROTOCOL,
  motionBaselinePhase,
  type MotionBaselineReport,
  type MotionRecording,
} from "@/lib/motion-engine";
import {
  baselineClock,
  elapsedClock,
  remainingClock,
} from "./motion-formatting";
import {
  GATE_B_DURATION_MS,
  GATE_B_PHASES,
  gateBPhase,
} from "./motion-gate-b";

export interface BaselineNoticeState {
  complete: boolean;
  durationMs: number;
}

export interface MotionDiagnosticsOverlayProps {
  baselineRunning: boolean;
  baselineElapsedMs: number;
  baselineProgress: number;
  performanceProfileRunning: boolean;
  performanceProfileMode: "quick" | "gate-b";
  performanceProfileCountdown: number;
  performanceProfileProgress: number;
  performanceProfileElapsedMs: number;
  baselineNotice: BaselineNoticeState | null;
  baselineReport: MotionBaselineReport | null;
  reportCopied: boolean;
  replaying: boolean;
  recordingData: MotionRecording | null;
  replayProgressRef: React.RefObject<HTMLProgressElement | null>;
  onCloseBaselineNotice: () => void;
  onDownloadBaselineReport: () => void;
  onCopyBaselineReport: () => Promise<void> | void;
}

/**
 * Stage overlay for Baseline 3-minute and Gate B 10-minute automated tests,
 * including countdowns, phase instructions, completion cards, and landmark replay HUD.
 */
export function MotionDiagnosticsOverlay({
  baselineRunning,
  baselineElapsedMs,
  baselineProgress,
  performanceProfileRunning,
  performanceProfileMode,
  performanceProfileCountdown,
  performanceProfileProgress,
  performanceProfileElapsedMs,
  baselineNotice,
  baselineReport,
  reportCopied,
  replaying,
  recordingData,
  replayProgressRef,
  onCloseBaselineNotice,
  onDownloadBaselineReport,
  onCopyBaselineReport,
}: MotionDiagnosticsOverlayProps): React.JSX.Element | null {
  const baselinePhase = motionBaselinePhase(baselineElapsedMs);
  const baselinePhaseIndex = MOTION_BASELINE_PROTOCOL.findIndex((p) => p.id === baselinePhase.id);
  const baselinePhaseSecondsLeft = Math.max(0, Math.ceil((baselinePhase.endsAtMs - baselineElapsedMs) / 1000));
  const nextBaselinePhase = MOTION_BASELINE_PROTOCOL[baselinePhaseIndex + 1];
  const showNextBaselinePhase = nextBaselinePhase && baselinePhaseSecondsLeft <= 7;

  const performanceGatePhase = gateBPhase(performanceProfileElapsedMs);
  const performanceGatePhaseIndex = GATE_B_PHASES.findIndex((p) => p.id === performanceGatePhase.id);
  const performanceGatePhaseSecondsLeft = Math.max(0, Math.ceil((performanceGatePhase.endsAtMs - performanceProfileElapsedMs) / 1000));
  const nextPerformanceGatePhase = GATE_B_PHASES[performanceGatePhaseIndex + 1];

  return (
    <>
      {baselineRunning ? (
        <div className="p100-motion-baseline-hud" aria-live="polite">
          <div className="p100-motion-baseline-hud-time">
            <span><Gauge /> Baslinjemätning pågår</span>
            <strong>{baselineClock(baselineElapsedMs)}</strong>
            <small>{Math.floor(baselineProgress)}% · stoppar automatiskt vid 3:00</small>
          </div>
          <div className="p100-motion-baseline-hud-instruction">
            <small>
              Moment {baselinePhaseIndex + 1}/{MOTION_BASELINE_PROTOCOL.length} · kamera {baselinePhase.cameraView}
            </small>
            <strong>{baselinePhase.title}</strong>
            <p>{baselinePhase.instruction}</p>
          </div>
          {showNextBaselinePhase ? (
            <div className="p100-motion-baseline-next">
              <small>Nästa om {baselinePhaseSecondsLeft} sek</small>
              <strong>{nextBaselinePhase.title} · {nextBaselinePhase.cameraView}</strong>
            </div>
          ) : null}
          <div className="p100-motion-baseline-hud-progress">
            <span style={{ width: `${baselineProgress}%` }} />
          </div>
        </div>
      ) : null}

      {performanceProfileRunning && performanceProfileMode === "gate-b" ? (
        <div className="p100-motion-profile-hud" aria-live="polite">
          {performanceProfileCountdown > 0 ? (
            <div className="p100-motion-profile-countdown">
              <small>Gå till din plats · testet startar om</small>
              <strong>{performanceProfileCountdown}</strong>
              <span>Stå framifrån med hela kroppen i bild</span>
            </div>
          ) : (
            <>
              <div className="p100-motion-profile-hud-time">
                <span><Gauge /> Gate B · 10 minuter</span>
                <strong>{remainingClock(GATE_B_DURATION_MS, performanceProfileElapsedMs)}</strong>
                <small>{Math.floor(performanceProfileProgress)}% · rapport skapas automatiskt</small>
              </div>
              <div className="p100-motion-profile-hud-instruction">
                <small>
                  Moment {performanceGatePhaseIndex + 1}/{GATE_B_PHASES.length}
                </small>
                <strong>{performanceGatePhase.title}</strong>
                <p>{performanceGatePhase.instruction}</p>
              </div>
              {nextPerformanceGatePhase && performanceGatePhaseSecondsLeft <= 7 ? (
                <div className="p100-motion-baseline-next">
                  <small>Nästa om {performanceGatePhaseSecondsLeft} sek</small>
                  <strong>{nextPerformanceGatePhase.title}</strong>
                </div>
              ) : null}
              <div className="p100-motion-baseline-hud-progress">
                <span style={{ width: `${performanceProfileProgress}%` }} />
              </div>
            </>
          )}
        </div>
      ) : null}

      {baselineNotice && baselineReport ? (
        <div
          className={`p100-motion-baseline-done ${baselineNotice.complete ? "complete" : "partial"}`}
          role="status"
        >
          <button
            type="button"
            className="close"
            onClick={onCloseBaselineNotice}
            aria-label="Stäng meddelandet"
          >
            <X />
          </button>
          <span className="icon">{baselineNotice.complete ? <Check /> : <CircleStop />}</span>
          <small>{baselineNotice.complete ? "Automatisk mätning slutförd" : "Delrapport skapad"}</small>
          <strong>
            {baselineNotice.complete ? "3 minuter klara!" : `Stoppad efter ${elapsedClock(baselineNotice.durationMs)}`}
          </strong>
          <p>
            {baselineNotice.complete
              ? "Rapporten är färdig att ladda ned eller kopiera."
              : "Starta igen och låt timern nå 0:00 för en fullständig rapport."}
          </p>
          <div>
            <button type="button" onClick={onDownloadBaselineReport}>
              <Download /> Ladda ned rapport (.json)
            </button>
            <button type="button" onClick={() => void onCopyBaselineReport()}>
              {reportCopied ? <Check /> : <Copy />} {reportCopied ? "Kopierad" : "Kopiera"}
            </button>
          </div>
        </div>
      ) : null}

      {replaying && recordingData ? (
        <div className="p100-motion-replay-hud" aria-live="polite">
          <div>
            <Play />
            <strong>Landmark-replay</strong>
            <span>{recordingData.frameCount} frames · {(recordingData.durationMs / 1000).toFixed(1)} s</span>
          </div>
          <progress ref={replayProgressRef} max={1} aria-label="Replay-förlopp" />
        </div>
      ) : null}
    </>
  );
}
