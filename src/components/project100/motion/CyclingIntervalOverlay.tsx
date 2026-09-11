"use client";

import {
  Bike,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gauge,
  Mountain,
  Pause,
  Play,
  SkipForward,
  Timer,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

import {
  formatIntervalTime,
  getResistanceBadgeColors,
  type CyclingIntervalSessionState,
} from "@/lib/motion-cycling-intervals";

export interface CyclingIntervalOverlayProps {
  session: CyclingIntervalSessionState;
  measuredCadenceRpm: number | null;
  measuredRevolutions: number;
  isLive: boolean;
  onTogglePause: () => void;
  onSkipStep: () => void;
  onToggleVoice: () => void;
  voiceEnabled: boolean;
  onFinish: () => void;
  onSaveToLog?: () => void;
  isSavedToLog?: boolean;
  isSavingToLog?: boolean;
  saveLogError?: string | null;
}

export function CyclingIntervalOverlay({
  session,
  measuredCadenceRpm,
  measuredRevolutions,
  isLive,
  onTogglePause,
  onSkipStep,
  onToggleVoice,
  voiceEnabled,
  onFinish,
  onSaveToLog,
  isSavedToLog = false,
  isSavingToLog = false,
  saveLogError = null,
}: CyclingIntervalOverlayProps) {
  const { currentStep, nextStep, stepRemainingSeconds, elapsedSeconds, plan, isCompleted, isPaused } = session;
  const resistanceColors = getResistanceBadgeColors(currentStep.resistance);

  const targetMin = currentStep.targetCadenceRpm.min;
  const targetMax = currentStep.targetCadenceRpm.max;

  const cadenceInRange =
    measuredCadenceRpm !== null &&
    measuredCadenceRpm >= targetMin &&
    measuredCadenceRpm <= targetMax;

  const cadenceTooLow = measuredCadenceRpm !== null && measuredCadenceRpm < targetMin;
  const cadenceTooHigh = measuredCadenceRpm !== null && measuredCadenceRpm > targetMax;

  const resistanceIcon =
    currentStep.resistance === "heavy" ? (
      <Mountain size={20} />
    ) : currentStep.resistance === "medium" ? (
      <Zap size={20} />
    ) : (
      <Gauge size={20} />
    );

  return (
    <div className="p100-cycling-interval-overlay" role="region" aria-label="Intervallpass på motionscykel">
      {/* 1. Header with Resistance Badge & Total Progress */}
      <div className="p100-cycling-hud-header">
        <div
          className="p100-cycling-resistance-badge"
          style={{
            backgroundColor: resistanceColors.bg,
            borderColor: resistanceColors.border,
            color: resistanceColors.text,
          }}
        >
          <span style={{ color: resistanceColors.iconColor }}>{resistanceIcon}</span>
          <div className="p100-cycling-resistance-text">
            <small>INSTÄLLT MOTSTÅND</small>
            <strong>{currentStep.resistanceLabel.toUpperCase()}</strong>
          </div>
        </div>

        <div className="p100-cycling-session-clock">
          <span className="p100-cycling-session-clock-label">
            <Timer size={13} /> TOTAL TID
          </span>
          <strong>
            {formatIntervalTime(elapsedSeconds)}
            <small> / {formatIntervalTime(plan.totalDurationSeconds)}</small>
          </strong>
        </div>
      </div>

      {/* 2. Main Center Card: Current Step & Countdown */}
      <div className="p100-cycling-hud-main">
        <div className="p100-cycling-step-meta">
          <span className="p100-cycling-step-number">
            Steg {currentStep.stepNumber} av {currentStep.totalSteps}
          </span>
          <h2 className="p100-cycling-step-name">{currentStep.name}</h2>
          <p className="p100-cycling-step-advice">{currentStep.resistanceAdvice}</p>
        </div>

        <div className="p100-cycling-timer-display">
          <div className="p100-cycling-countdown">
            <span className="p100-cycling-countdown-val">
              {formatIntervalTime(stepRemainingSeconds)}
            </span>
            <small>kvar i fasen</small>
          </div>

          <div className="p100-cycling-metrics-grid">
            <div className="p100-cycling-metric-box">
              <small>MÅLKADENS</small>
              <strong>{targetMin}–{targetMax} <small>RPM</small></strong>
            </div>

            <div className="p100-cycling-metric-box">
              <small>LIVE KADENS</small>
              {isLive ? (
                measuredCadenceRpm !== null ? (
                  <strong
                    style={{
                      color: cadenceInRange ? "#34d399" : cadenceTooLow ? "#fbbf24" : "#f87171",
                    }}
                  >
                    {measuredCadenceRpm} <small>RPM {cadenceInRange ? "✓" : cadenceTooLow ? "↑" : "↓"}</small>
                  </strong>
                ) : (
                  <span className="p100-cycling-metric-searching">Mäter...</span>
                )
              ) : (
                <span className="p100-cycling-metric-manual">Fri takt</span>
              )}
            </div>

            <div className="p100-cycling-metric-box">
              <small>PEDALVARV</small>
              <strong>{measuredRevolutions} <small>varv</small></strong>
            </div>

            <div className="p100-cycling-metric-box">
              <small>UPPSKATTAD ENERGI</small>
              <strong><Flame size={12} /> {session.estimatedCalories} <small>kcal</small></strong>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Next Interval Preview */}
      {nextStep ? (
        <div className="p100-cycling-next-preview">
          <div className="p100-cycling-next-tag">
            <span>NÄSTA INTERVALL</span>
            <ChevronRight size={14} />
          </div>
          <div className="p100-cycling-next-info">
            <strong>{nextStep.name}</strong>
            <span>Motstånd: {nextStep.resistanceLabel} ({formatIntervalTime(nextStep.durationSeconds)})</span>
          </div>
        </div>
      ) : isCompleted ? (
        <div className="p100-cycling-completed-banner">
          <CheckCircle2 size={24} style={{ color: "#34d399" }} />
          <div>
            <strong>Grymt kört! 🎉 30 minuters intervallpass fullföljt!</strong>
            <p>Du har tagit dig igenom alla 22 intervallblock. Spara passet till din träningslogg.</p>
          </div>
        </div>
      ) : null}

      {/* 4. Segmented Progress Bar */}
      <div className="p100-cycling-timeline-track" aria-label="Tidslinje över passets 30 minuter">
        <div
          className="p100-cycling-timeline-fill"
          style={{ width: `${session.progressPercent}%` }}
        />
      </div>

      {/* 5. Controls Bar */}
      <div className="p100-cycling-controls-bar">
        <div className="p100-cycling-controls-left">
          <button
            type="button"
            className="p100-cycling-btn p100-cycling-btn-primary"
            onClick={onTogglePause}
            aria-label={isPaused ? "Återuppta passet" : "Pausa passet"}
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            <span>{isPaused ? "Återuppta" : "Pausa"}</span>
          </button>

          <button
            type="button"
            className="p100-cycling-btn p100-cycling-btn-secondary"
            onClick={onSkipStep}
            disabled={isCompleted}
            title="Hoppa direkt till nästa intervall"
          >
            <SkipForward size={16} />
            <span>Nästa intervall</span>
          </button>

          <button
            type="button"
            className={`p100-cycling-btn p100-cycling-btn-secondary ${voiceEnabled ? "active" : ""}`}
            onClick={onToggleVoice}
            title={voiceEnabled ? "Stäng av röstcoach" : "Slå på röstcoach"}
          >
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{voiceEnabled ? "Röstcoach PÅ" : "Röstcoach AV"}</span>
          </button>
        </div>

        <div className="p100-cycling-controls-right">
          <button
            type="button"
            className={`p100-cycling-btn p100-cycling-btn-finish ${isSavedToLog ? "saved" : ""}`}
            onClick={() => {
              if (isSavedToLog) return;
              if (onSaveToLog) {
                onSaveToLog();
              } else {
                onFinish();
              }
            }}
            disabled={isSavingToLog || isSavedToLog}
          >
            {isSavedToLog ? <CheckCircle2 size={16} /> : <Bike size={16} />}
            <span>
              {isSavingToLog
                ? "Sparar pass..."
                : isSavedToLog
                ? "Sparat i logg!"
                : isCompleted
                ? "Spara & logga pass"
                : "Avsluta & logga"}
            </span>
          </button>
          {saveLogError ? (
            <span className="p100-cycling-save-error" role="alert" style={{ fontSize: "0.75rem", color: "#f87171" }}>
              {saveLogError}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
