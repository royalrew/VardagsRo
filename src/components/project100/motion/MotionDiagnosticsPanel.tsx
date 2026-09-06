"use client";

import {
  Check,
  CircleStop,
  Copy,
  Download,
  Gauge,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import React from "react";

import {
  MOTION_BASELINE_PROTOCOL,
  type MotionBaselineReport,
  type MotionColdStartStats,
  type MotionPerformanceProfileReport,
  type MotionRecording,
} from "@/lib/motion-engine";
import {
  baselineClock,
  elapsedClock,
  milliseconds,
  remainingClock,
  rounded,
} from "./motion-formatting";

export type PerformanceProfileMode = "quick" | "gate-b";
export type EngineStatus = "idle" | "requesting" | "loading" | "running" | "recovering" | "error";
export type PoseExecutionMode = "worker" | "main-thread";

export interface MotionMetrics {
  captureFps: number;
  poseHz: number;
  renderFps: number;
  inferenceP50: number | null;
  inferenceP95: number | null;
  bufferWaitP50: number | null;
  bufferWaitP95: number | null;
  preparationP50: number | null;
  preparationP95: number | null;
  overheadP50: number | null;
  overheadP95: number | null;
  pipelineP50: number | null;
  pipelineP95: number | null;
  firstRenderP50: number | null;
  firstRenderP95: number | null;
  heldLowConfidencePercent: number;
  limitedOutlierPercent: number;
  droppedFrames: number;
}

export interface MotionDiagnosticsPanelProps {
  metrics: MotionMetrics;
  performanceProfileRunning: boolean;
  performanceProfileMode: PerformanceProfileMode;
  performanceProfileCountdown: number;
  performanceProfileDurationMs: number;
  performanceProfileElapsedMs: number;
  performanceProfileReport: MotionPerformanceProfileReport | null;
  performanceProfileCopied: boolean;
  onStartPerformanceProfile: (mode: PerformanceProfileMode) => void;
  onFinishPerformanceProfile: () => void;
  onCopyPerformanceProfile: () => Promise<void> | void;
  onDownloadPerformanceProfile: () => void;
  coldStarts: MotionColdStartStats;
  onResetColdStarts: () => void;
  onSimulateWorkerFailure: () => void;
  status: EngineStatus;
  poseExecutionMode: PoseExecutionMode;
  // Recording
  recording: boolean;
  recordedFrameCount: number;
  recordingData: MotionRecording | null;
  replaying: boolean;
  onBeginRecording: () => void;
  onFinishRecording: () => void;
  onReplayRecording: () => void;
  onCancelReplay: () => void;
  onDownloadRecording: () => void;
  // Baseline
  baselineRunning: boolean;
  baselineElapsedMs: number;
  baselineProgress: number;
  baselinePhaseId: string;
  baselineReport: MotionBaselineReport | null;
  baselinePassedChecks: number;
  voiceGuidance: boolean;
  reportCopied: boolean;
  luminance: number | null;
  lightOkay: boolean;
  fullBodyVisible: boolean;
  onToggleVoiceGuidance: () => void;
  onStartBaseline: () => void;
  onFinishBaseline: () => void;
  onCopyBaselineReport: () => Promise<void> | void;
  onDownloadBaselineReport: () => void;
  // Common states
  isLive: boolean;
  isRecovering: boolean;
  gameActive: boolean;
  squatTrackingEnabled: boolean;
}

/**
 * Diagnostics & profiler components for Motion Lab:
 * - Pipeline telemetry & latency percentiles
 * - Quick (30s) / Gate B (10m) performance profiler
 * - Gate A cold start counter & worker restart tester
 * - Advanced collapsible with landmark recording/replay and 3-minute baseline
 */
export function MotionDiagnosticsPanel({
  metrics,
  performanceProfileRunning,
  performanceProfileMode: _performanceProfileMode,
  performanceProfileCountdown,
  performanceProfileDurationMs,
  performanceProfileElapsedMs,
  performanceProfileReport,
  performanceProfileCopied,
  onStartPerformanceProfile,
  onFinishPerformanceProfile,
  onCopyPerformanceProfile,
  onDownloadPerformanceProfile,
  coldStarts,
  onResetColdStarts,
  onSimulateWorkerFailure,
  status,
  poseExecutionMode,
  recording,
  recordedFrameCount,
  recordingData,
  replaying,
  onBeginRecording,
  onFinishRecording,
  onReplayRecording,
  onCancelReplay,
  onDownloadRecording,
  baselineRunning,
  baselineElapsedMs,
  baselineProgress,
  baselinePhaseId,
  baselineReport,
  baselinePassedChecks,
  voiceGuidance,
  reportCopied,
  luminance,
  lightOkay,
  fullBodyVisible,
  onToggleVoiceGuidance,
  onStartBaseline,
  onFinishBaseline,
  onCopyBaselineReport,
  onDownloadBaselineReport,
  isLive,
  isRecovering,
  gameActive,
  squatTrackingEnabled,
}: MotionDiagnosticsPanelProps): React.JSX.Element {
  return (
    <>
      <details className="p100-motion-panel p100-motion-benchmark p100-motion-collapsible">
        <summary>
          <span>Live telemetry</span>
          <strong>Pipeline</strong>
        </summary>
        <div className="p100-motion-metric-grid">
          <article>
            <small>Capture</small>
            <strong>{metrics.captureFps}</strong>
            <span>FPS</span>
          </article>
          <article>
            <small>Pose</small>
            <strong>{metrics.poseHz}</strong>
            <span>Hz</span>
          </article>
          <article>
            <small>Render</small>
            <strong>{metrics.renderFps}</strong>
            <span>FPS</span>
          </article>
          <article>
            <small>Tappade</small>
            <strong>{metrics.droppedFrames}</strong>
            <span>frames</span>
          </article>
        </div>
        <dl className="p100-motion-latency">
          <div><dt>Inferens p50</dt><dd>{milliseconds(metrics.inferenceP50)}</dd></div>
          <div><dt>Inferens p95</dt><dd>{milliseconds(metrics.inferenceP95)}</dd></div>
          <div><dt>Buffertväntan p50</dt><dd>{milliseconds(metrics.bufferWaitP50)}</dd></div>
          <div><dt>Buffertväntan p95</dt><dd>{milliseconds(metrics.bufferWaitP95)}</dd></div>
          <div><dt>Bildprep p50</dt><dd>{milliseconds(metrics.preparationP50)}</dd></div>
          <div><dt>Bildprep p95</dt><dd>{milliseconds(metrics.preparationP95)}</dd></div>
          <div><dt>Övrig overhead p50</dt><dd>{milliseconds(metrics.overheadP50)}</dd></div>
          <div><dt>Övrig overhead p95</dt><dd>{milliseconds(metrics.overheadP95)}</dd></div>
          <div><dt>Pose-pipeline p50</dt><dd>{milliseconds(metrics.pipelineP50)}</dd></div>
          <div><dt>Pose-pipeline p95</dt><dd>{milliseconds(metrics.pipelineP95)}</dd></div>
          <div><dt>Första render p50</dt><dd>{milliseconds(metrics.firstRenderP50)}</dd></div>
          <div><dt>Första render p95</dt><dd>{milliseconds(metrics.firstRenderP95)}</dd></div>
          <div><dt>Låg confidence hållen</dt><dd>{metrics.heldLowConfidencePercent}%</dd></div>
          <div><dt>Outliers begränsade</dt><dd>{metrics.limitedOutlierPercent}%</dd></div>
        </dl>
        <div className="p100-motion-profiler">
          {performanceProfileRunning ? (
            <button type="button" className="running" onClick={onFinishPerformanceProfile}>
              <CircleStop /> Stoppa ·{" "}
              {performanceProfileCountdown > 0
                ? `${performanceProfileCountdown} s till start`
                : remainingClock(performanceProfileDurationMs, performanceProfileElapsedMs)}
            </button>
          ) : (
            <div className="p100-motion-profiler-actions">
              <button
                type="button"
                onClick={() => onStartPerformanceProfile("quick")}
                disabled={
                  !isLive ||
                  isRecovering ||
                  baselineRunning ||
                  replaying ||
                  gameActive ||
                  squatTrackingEnabled
                }
              >
                <Gauge /> Snabbprofil · 30 s
              </button>
              <button
                type="button"
                onClick={() => onStartPerformanceProfile("gate-b")}
                disabled={
                  !isLive ||
                  isRecovering ||
                  baselineRunning ||
                  replaying ||
                  gameActive ||
                  squatTrackingEnabled
                }
              >
                <Play /> Gate B · 10 min
              </button>
            </div>
          )}
          {performanceProfileReport ? (
            <div className="p100-motion-profile-result">
              <small>
                {performanceProfileReport.protocol === "gate-b-10m-v1"
                  ? "Fryst Gate B-resultat"
                  : "Fryst 30-sekundersresultat"}
              </small>
              <strong>
                {performanceProfileReport.summary.poseHzAverage} Hz ·{" "}
                {performanceProfileReport.summary.inferenceP95} ms p95
              </strong>
              <span>
                Capture {performanceProfileReport.summary.captureFpsAverage} · Render{" "}
                {performanceProfileReport.summary.renderFpsAverage} FPS
              </span>
              <span>
                Buffert {performanceProfileReport.summary.bufferWaitP95} ms · Bildprep{" "}
                {performanceProfileReport.summary.preparationP95} ms · Övrigt{" "}
                {performanceProfileReport.summary.overheadP95} ms p95
              </span>
              <span>
                {Object.values(performanceProfileReport.checks).filter(Boolean).length}/6
                kvalitetskontroller · {performanceProfileReport.counts.droppedFrames} tappade ·{" "}
                {performanceProfileReport.counts.workerRestarts} worker-omstarter
              </span>
              <div>
                <button type="button" onClick={() => void onCopyPerformanceProfile()}>
                  {performanceProfileCopied ? <Check /> : <Copy />}{" "}
                  {performanceProfileCopied ? "Kopierad" : "Kopiera JSON"}
                </button>
                <button type="button" onClick={onDownloadPerformanceProfile}>
                  <Download /> Ladda ned
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </details>

      <details className="p100-motion-panel p100-motion-cold-starts p100-motion-collapsible">
        <summary>
          <span>Gate A</span>
          <strong>Kallstarter</strong>
        </summary>
        <div>
          <strong>
            {coldStarts.successes}/{coldStarts.attempts}
          </strong>
          <span>Mål: minst 9 lyckade av 10 försök.</span>
        </div>
        <button type="button" onClick={onResetColdStarts}>
          <RotateCcw /> Nollställ räknare
        </button>
        <button
          type="button"
          onClick={onSimulateWorkerFailure}
          disabled={status !== "running" || poseExecutionMode !== "worker"}
          title={
            poseExecutionMode === "main-thread"
              ? "Mobilmotorn kör avsiktligt utan Web Worker på iPhone"
              : "Pausar kort och provar den automatiska återhämtningen"
          }
        >
          <RefreshCw />{" "}
          {poseExecutionMode === "main-thread" ? "Mobil fallback aktiv" : "Testa worker-återstart"}
        </button>
      </details>

      <details className="p100-motion-advanced">
        <summary>
          <span><ShieldCheck /></span>
          <div>
            <small>Valfritt · Gate A är redan godkänd</small>
            <strong>Avancerad diagnostik</strong>
            <p>Landmark-inspelning, replay och treminutersbaslinje.</p>
          </div>
          <b>Visa verktyg</b>
        </summary>
        <div className="p100-motion-advanced-content">
          <section className="p100-motion-recording">
            <div className="p100-motion-recording-copy">
              <span><ShieldCheck /></span>
              <div>
                <small>Privat testdata</small>
                <strong>Landmark-logg, aldrig råvideo</strong>
                <p>
                  Spela in pose-snapshots och tidsstämplar för reproducerbar replay. Filen lämnar inte
                  enheten om du inte själv flyttar den.
                </p>
              </div>
            </div>
            <div className="p100-motion-recording-actions">
              {recording ? (
                <button type="button" className="recording" onClick={onFinishRecording}>
                  <CircleStop /> Stoppa · {recordedFrameCount} frames
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onBeginRecording}
                  disabled={
                    !isLive ||
                    isRecovering ||
                    replaying ||
                    baselineRunning ||
                    performanceProfileRunning
                  }
                >
                  <Square /> Spela in landmarks
                </button>
              )}
              <button
                type="button"
                onClick={replaying ? onCancelReplay : onReplayRecording}
                disabled={
                  !recordingData ||
                  recording ||
                  gameActive ||
                  baselineRunning ||
                  performanceProfileRunning
                }
              >
                <Play /> {replaying ? "Stoppa replay" : "Replay"}
              </button>
              <button
                type="button"
                onClick={onDownloadRecording}
                disabled={!recordingData}
              >
                <Download /> Ladda ned replay (.json)
              </button>
            </div>
            {recordingData && !recording ? (
              <small className="p100-motion-recording-ready">
                Redo: {recordingData.frameCount} frames över{" "}
                {(recordingData.durationMs / 1000).toFixed(1)} sekunder.
              </small>
            ) : null}
          </section>

          <section className="p100-motion-baseline">
            <div className="p100-motion-baseline-head">
              <div>
                <small>Fas A · reproducerbar mätning</small>
                <strong>3 min baslinje</strong>
                <p>
                  Rör dig som i spelet: stå neutralt, slå åt sidorna, gör knäböj och ducka. Endast
                  mätvärden och synlighetsflaggor sparas.
                </p>
              </div>
              <div className="p100-motion-baseline-actions">
                <button
                  type="button"
                  className="voice"
                  onClick={onToggleVoiceGuidance}
                  aria-pressed={voiceGuidance}
                >
                  {voiceGuidance ? <Volume2 /> : <VolumeX />} Röstguide {voiceGuidance ? "på" : "av"}
                </button>
                {baselineRunning ? (
                  <button
                    type="button"
                    className="running"
                    onClick={onFinishBaseline}
                    title="Avslutar före tre minuter och skapar en delrapport"
                  >
                    <CircleStop /> Avbryt · {baselineClock(baselineElapsedMs)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onStartBaseline}
                    disabled={
                      !isLive ||
                      isRecovering ||
                      recording ||
                      replaying ||
                      gameActive ||
                      performanceProfileRunning ||
                      squatTrackingEnabled
                    }
                  >
                    <Play /> Starta 3 min
                  </button>
                )}
                <button
                  type="button"
                  className="report-download"
                  onClick={onDownloadBaselineReport}
                  disabled={!baselineReport}
                >
                  <Download /> Ladda ned rapport (.json)
                </button>
                <button
                  type="button"
                  onClick={() => void onCopyBaselineReport()}
                  disabled={!baselineReport}
                >
                  {reportCopied ? <Check /> : <Copy />}{" "}
                  {reportCopied ? "Rapport kopierad" : "Kopiera rapport"}
                </button>
              </div>
            </div>

            <div className="p100-motion-baseline-progress" aria-label="Baslinjemätningens förlopp">
              <span style={{ width: `${baselineProgress}%` }} />
            </div>

            <div className="p100-motion-baseline-protocol">
              {MOTION_BASELINE_PROTOCOL.map((phase, index) => (
                <article
                  key={phase.id}
                  className={baselineRunning && phase.id === baselinePhaseId ? "active" : ""}
                >
                  <small>
                    {index + 1} · {phase.cameraView}
                  </small>
                  <strong>{phase.title}</strong>
                  <span>{Math.round((phase.endsAtMs - phase.startsAtMs) / 1000)} sek</span>
                </article>
              ))}
              <p>
                <strong>Vinkelguide:</strong> Framifrån visar höger–vänster-symmetri. Cirka 45° ger
                bättre djupinformation utan att benen överlappar. Golvarmhävningar analyseras bäst från
                sidan, men kräver en separat kameravinkel som ser händer till fötter och ingår därför
                inte i vardagsrumsbaslinjen.
              </p>
            </div>

            {baselineRunning ? (
              <div className="p100-motion-baseline-live" aria-live="polite">
                <span className={fullBodyVisible ? "ok" : "warn"}>
                  {fullBodyVisible ? "Hel kropp synlig" : "Backa – kroppen lämnar bild"}
                </span>
                <span className={lightOkay ? "ok" : "warn"}>
                  {lightOkay ? `Ljus ${rounded(luminance ?? 0)}` : "Mer ljus hjälper precisionen"}
                </span>
                <span>{baselineClock(baselineElapsedMs)} kvar</span>
              </div>
            ) : null}

            {baselineReport ? (
              <div className="p100-motion-baseline-report">
                <header>
                  <div>
                    <small>Senaste rapport</small>
                    <strong>{baselinePassedChecks}/4 kvalitetskontroller</strong>
                  </div>
                  <span>
                    {baselineReport.actualResolution} · {baselineReport.delegate}
                  </span>
                </header>
                <div className="p100-motion-baseline-metrics">
                  <article>
                    <small>Capture snitt</small>
                    <strong>{baselineReport.summary.captureFpsAverage}</strong>
                    <span>FPS</span>
                  </article>
                  <article>
                    <small>Pose snitt</small>
                    <strong>{baselineReport.summary.poseHzAverage}</strong>
                    <span>Hz</span>
                  </article>
                  <article>
                    <small>Första render p95</small>
                    <strong>{milliseconds(baselineReport.summary.firstRenderP95)}</strong>
                  </article>
                  <article>
                    <small>Hel kropp</small>
                    <strong>{baselineReport.summary.fullBodyVisiblePercent}%</strong>
                  </article>
                </div>
                <div className="p100-motion-baseline-checks">
                  <span className={baselineReport.checks.captureNear30Fps ? "ok" : "warn"}>
                    <i /> Capture nära 30 FPS
                  </span>
                  <span className={baselineReport.checks.renderNear60Fps ? "ok" : "warn"}>
                    <i /> Render nära 60 FPS
                  </span>
                  <span className={baselineReport.checks.poseAtLeast20Hz ? "ok" : "warn"}>
                    <i /> Pose minst 20 Hz
                  </span>
                  <span className={baselineReport.checks.bodyVisibleAtLeast90Percent ? "ok" : "warn"}>
                    <i /> Hel kropp minst 90%
                  </span>
                </div>
                <small className="p100-motion-baseline-note">
                  {baselineReport.sampleCount} prover över{" "}
                  {(baselineReport.durationMs / 1000).toFixed(1)} sekunder · pose guard:{" "}
                  {baselineReport.summary.heldLowConfidencePercent}% hållna,{" "}
                  {baselineReport.summary.limitedOutlierPercent}% begränsade · ingen råvideo · detta är
                  filen att skicka för analys
                </small>
              </div>
            ) : null}
          </section>
        </div>
      </details>
    </>
  );
}
