"use client";

import {
  Camera,
  Check,
  CircleStop,
  Copy,
  Download,
  Gauge,
  Heart,
  Maximize,
  Minimize,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Swords,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

import {
  motionArenaCue,
  motionArenaStartCue,
  type MotionArenaCue,
  type MotionArenaLanguage,
} from "@/lib/motion-announcer";
import {
  MOTION_BASELINE_PROTOCOL,
  MOTION_WORKER_MAX_RESTARTS,
  POSE_CONNECTIONS,
  buildMotionBaselineReport,
  buildMotionPerformanceProfile,
  cameraFailureMessage,
  createMotionRecording,
  frameLuminance,
  hasUsableFullBody,
  motionBaselinePhase,
  motionWorkerRetryDelayMs,
  nextMotionTimestampMs,
  registerColdStartAttempt,
  registerColdStartSuccess,
  scheduleMotionVideoFrame,
  summarizeMotionMetrics,
  type MotionBaselineReport,
  type MotionBaselineSample,
  type MotionColdStartStats,
  type MotionFrameSchedulerState,
  type MotionLandmark,
  type MotionPoseSnapshot,
  type MotionPerformanceProfileReport,
  type MotionRecordedFrame,
  type MotionRecording,
} from "@/lib/motion-engine";
import {
  advanceMotionGame,
  canStartMotionGame,
  motionGameCountdown,
  motionGameSecondsRemaining,
  pauseMotionGameFor,
  startMotionGame,
  type MotionGameDifficulty,
  type MotionGameEffect,
  type MotionGameState,
  type MotionGameTarget,
} from "@/lib/motion-game";
import { MotionLandmarkStabilizer } from "@/lib/motion-stabilizer";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const COLD_START_STORAGE_KEY = "projekt100.motion-lab.cold-starts.v1";
const MAX_RECORDED_FRAMES = 18_000;
const BASELINE_DURATION_MS = 180_000;
const QUICK_PROFILE_DURATION_MS = 30_000;
const GATE_B_DURATION_MS = 600_000;
const GATE_B_COUNTDOWN_MS = 7_000;
const DARK_LUMINANCE_THRESHOLD = 45;

type EngineStatus = "idle" | "requesting" | "loading" | "running" | "recovering" | "error";
type Resolution = "640x480" | "1280x720";
type PerformanceProfileMode = "quick" | "gate-b";
type PoseExecutionMode = "worker" | "main-thread";

interface GateBPhase {
  id: string;
  startsAtMs: number;
  endsAtMs: number;
  title: string;
  instruction: string;
}

const GATE_B_PHASES: readonly GateBPhase[] = [
  { id: "punch-1", startsAtMs: 0, endsAtMs: 60_000, title: "Slag", instruction: "Stå framifrån och växla lugna raka slag med båda händerna." },
  { id: "squat-1", startsAtMs: 60_000, endsAtMs: 120_000, title: "Knäböj", instruction: "Gör kontrollerade knäböj. Håll hela kroppen kvar i bild." },
  { id: "duck-1", startsAtMs: 120_000, endsAtMs: 180_000, title: "Duckningar", instruction: "Växla stående position med tydliga duckningar och res dig helt." },
  { id: "mixed-1", startsAtMs: 180_000, endsAtMs: 300_000, title: "Blandad rörelse", instruction: "Blanda slag, sidosteg, knäböj och duckningar i lugnt tempo." },
  { id: "punch-2", startsAtMs: 300_000, endsAtMs: 360_000, title: "Slag igen", instruction: "Växla höga, raka och breda slag. Stanna framför kameran." },
  { id: "squat-2", startsAtMs: 360_000, endsAtMs: 420_000, title: "Knäböj igen", instruction: "Fortsätt med kontrollerade knäböj och full resning." },
  { id: "duck-2", startsAtMs: 420_000, endsAtMs: 480_000, title: "Duckningar igen", instruction: "Ducka tydligt, res dig och lägg in lugna sidosteg." },
  { id: "mixed-2", startsAtMs: 480_000, endsAtMs: 600_000, title: "Sluttest", instruction: "Blanda alla rörelser. Fortsätt tills rösten säger att testet är klart." },
] as const;

function gateBPhase(elapsedMs: number): GateBPhase {
  return GATE_B_PHASES.find((phase) => elapsedMs >= phase.startsAtMs && elapsedMs < phase.endsAtMs)
    ?? GATE_B_PHASES[GATE_B_PHASES.length - 1];
}

function needsMainThreadPose(): boolean {
  const navigatorWithPlatform = navigator as Navigator & { platform?: string };
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigatorWithPlatform.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

interface MotionMetrics {
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

interface RunningPerformanceProfile {
  mode: PerformanceProfileMode;
  durationMs: number;
  startedAt: number;
  captures: number;
  poses: number;
  renders: number;
  droppedFrames: number;
  workerRestarts: number;
  inferenceSamples: number[];
  bufferWaitSamples: number[];
  preparationSamples: number[];
  overheadSamples: number[];
  pipelineSamples: number[];
  firstRenderSamples: number[];
}

interface WorkerReadyMessage {
  type: "ready";
  delegate: "GPU" | "CPU";
}

interface WorkerPoseMessage {
  type: "pose";
  snapshot: MotionPoseSnapshot;
}

interface WorkerErrorMessage {
  type: "error";
  message: string;
}

type PoseWorkerMessage = WorkerReadyMessage | WorkerPoseMessage | WorkerErrorMessage;

const EMPTY_METRICS: MotionMetrics = {
  captureFps: 0,
  poseHz: 0,
  renderFps: 0,
  inferenceP50: null,
  inferenceP95: null,
  bufferWaitP50: null,
  bufferWaitP95: null,
  preparationP50: null,
  preparationP95: null,
  overheadP50: null,
  overheadP95: null,
  pipelineP50: null,
  pipelineP95: null,
  firstRenderP50: null,
  firstRenderP95: null,
  heldLowConfidencePercent: 0,
  limitedOutlierPercent: 0,
  droppedFrames: 0,
};

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function milliseconds(value: number | null): string {
  return value === null ? "—" : `${rounded(value)} ms`;
}

function baselineClock(elapsedMs: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((BASELINE_DURATION_MS - elapsedMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  return `${minutes}:${String(remainingSeconds % 60).padStart(2, "0")}`;
}

function elapsedClock(elapsedMs: number): string {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
}

function remainingClock(durationMs: number, elapsedMs: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((durationMs - Math.max(0, elapsedMs)) / 1_000));
  return `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
}

function drawSnapshot(canvas: HTMLCanvasElement, snapshot: MotionPoseSnapshot | null) {
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

function drawMotionGame(
  canvas: HTMLCanvasElement,
  game: MotionGameState | null,
  nowMs: number,
  arenaLang: MotionArenaLanguage = "en",
) {
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
    context.save();
    context.strokeStyle = "rgba(255, 120, 240, 0.75)";
    context.shadowBlur = 18;
    context.shadowColor = "rgba(255, 100, 230, 0.85)";
    context.lineWidth = Math.max(3, canvas.height / 200);
    context.setLineDash([8, 8]);
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

    context.save();
    if (isKick) {
      context.shadowBlur = 32;
      context.shadowColor = "rgba(255, 200, 50, 0.9)";
      context.fillStyle = "rgba(120, 80, 10, 0.78)";
      context.strokeStyle = "#ffd040";
    } else if (isDual) {
      context.shadowBlur = 32;
      context.shadowColor = isSecondary ? "rgba(255, 100, 230, 0.9)" : "rgba(100, 210, 255, 0.9)";
      context.fillStyle = isSecondary ? "rgba(110, 20, 95, 0.78)" : "rgba(19, 84, 105, 0.78)";
      context.strokeStyle = isSecondary ? "#ff88ec" : "#7de8ff";
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
      movementLabel = arenaLang === "sv" ? "BÅDA" : "DUAL";
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

function parseStoredColdStarts(): MotionColdStartStats {
  try {
    const value = JSON.parse(localStorage.getItem(COLD_START_STORAGE_KEY) ?? "null") as Partial<MotionColdStartStats> | null;
    if (
      value &&
      Number.isInteger(value.attempts) &&
      Number.isInteger(value.successes) &&
      (value.attempts ?? -1) >= 0 &&
      (value.successes ?? -1) >= 0
    ) {
      return {
        attempts: value.attempts as number,
        successes: Math.min(value.attempts as number, value.successes as number),
      };
    }
  } catch {
    // A corrupt local benchmark is safe to replace; no server data is involved.
  }
  return { attempts: 0, successes: 0 };
}

export function MotionLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const replayProgressRef = useRef<HTMLProgressElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const mainThreadPoseRef = useRef<PoseLandmarker | null>(null);
  const mainThreadStabilizerRef = useRef(new MotionLandmarkStabilizer());
  const mainThreadLastTimestampRef = useRef(-1);
  const poseExecutionModeRef = useRef<PoseExecutionMode>("worker");
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const replayFrameRef = useRef<number | null>(null);
  const reportCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyOverflowBeforeFullscreenRef = useRef("");
  const workerRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerGenerationRef = useRef(0);
  const workerRestartAttemptsRef = useRef(0);
  const workerStablePosesRef = useRef(0);
  const workerRecoveryStartedAtRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const engineReadyRef = useRef(false);
  const inferencePendingRef = useRef(false);
  const replayingRef = useRef(false);
  const recordingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const recordedFramesRef = useRef<MotionRecordedFrame[]>([]);
  const snapshotRef = useRef<MotionPoseSnapshot | null>(null);
  const recentGamePoseRef = useRef<{
    snapshot: MotionPoseSnapshot;
    receivedAtMs: number;
  } | null>(null);
  const frameSchedulerRef = useRef<MotionFrameSchedulerState>({
    lastObservedVideoTime: -1,
    bufferedTimestampMs: null,
    bufferedCapturedAtMs: null,
  });
  const lastRenderedPoseTimestampRef = useRef(-1);
  const lastLuminanceAtRef = useRef(0);
  const luminanceRef = useRef<number | null>(null);
  const voiceGuidanceRef = useRef(true);
  const spokenBaselinePhaseRef = useRef<string | null>(null);
  const spokenNextPhaseRef = useRef<string | null>(null);
  const lastArenaSpeechAtRef = useRef(-Infinity);
  const poseVisibleRef = useRef(false);
  const fullBodyVisibleRef = useRef(false);
  const performanceProfileRef = useRef<RunningPerformanceProfile | null>(null);
  const spokenPerformancePhaseRef = useRef<string | null>(null);
  const spokenNextPerformancePhaseRef = useRef<string | null>(null);
  const baselineRef = useRef<{
    startedAt: number;
    startingDroppedFrames: number;
    samples: MotionBaselineSample[];
  } | null>(null);
  const cameraInfoRef = useRef<{
    requestedResolution: string;
    actualResolution: string;
    delegate: "GPU" | "CPU" | "unknown";
  }>({ requestedResolution: "640 × 480", actualResolution: "unknown", delegate: "unknown" });
  const coldStartRef = useRef<MotionColdStartStats>({ attempts: 0, successes: 0 });
  const gameRef = useRef<MotionGameState | null>(null);
  const lastGameUiAtRef = useRef(0);
  const lastGameEffectIdRef = useRef<number | null>(null);
  const statsRef = useRef({
    reportStartedAt: 0,
    captures: 0,
    poses: 0,
    renders: 0,
    dropped: 0,
    inferenceSamples: [] as number[],
    bufferWaitSamples: [] as number[],
    preparationSamples: [] as number[],
    overheadSamples: [] as number[],
    pipelineSamples: [] as number[],
    renderSamples: [] as number[],
    processedLandmarks: 0,
    heldLowConfidence: 0,
    limitedOutliers: 0,
  });

  const [status, setStatus] = useState<EngineStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Resolution>("640x480");
  const [actualResolution, setActualResolution] = useState<string | null>(null);
  const [cameraAspectRatio, setCameraAspectRatio] = useState<number | null>(null);
  const [changingResolution, setChangingResolution] = useState(false);
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | null>(null);
  const [poseExecutionMode, setPoseExecutionMode] = useState<PoseExecutionMode>("worker");
  const [poseVisible, setPoseVisible] = useState(false);
  const [fullBodyVisible, setFullBodyVisible] = useState(false);
  const [luminance, setLuminance] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<MotionMetrics>(EMPTY_METRICS);
  const [recording, setRecording] = useState(false);
  const [recordedFrameCount, setRecordedFrameCount] = useState(0);
  const [recordingData, setRecordingData] = useState<MotionRecording | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [viewportFullscreen, setViewportFullscreen] = useState(false);
  const [gameView, setGameView] = useState<MotionGameState | null>(null);
  const [coldStarts, setColdStarts] = useState<MotionColdStartStats>({ attempts: 0, successes: 0 });
  const [baselineRunning, setBaselineRunning] = useState(false);
  const [baselineElapsedMs, setBaselineElapsedMs] = useState(0);
  const [baselineReport, setBaselineReport] = useState<MotionBaselineReport | null>(null);
  const [baselineNotice, setBaselineNotice] = useState<{ complete: boolean; durationMs: number } | null>(null);
  const [reportCopied, setReportCopied] = useState(false);
  const [voiceGuidance, setVoiceGuidance] = useState(true);
  const [arenaLanguage, setArenaLanguage] = useState<MotionArenaLanguage>("en");
  const arenaLanguageRef = useRef<MotionArenaLanguage>("en");
  const [difficulty, setDifficulty] = useState<MotionGameDifficulty>("medium");
  const difficultyRef = useRef<MotionGameDifficulty>("medium");
  const [workerRecoveryAttempt, setWorkerRecoveryAttempt] = useState<number | null>(null);
  const [performanceProfileRunning, setPerformanceProfileRunning] = useState(false);
  const [performanceProfileMode, setPerformanceProfileMode] = useState<PerformanceProfileMode>("quick");
  const [performanceProfileElapsedMs, setPerformanceProfileElapsedMs] = useState(0);
  const [performanceProfileReport, setPerformanceProfileReport] = useState<MotionPerformanceProfileReport | null>(null);
  const [performanceProfileCopied, setPerformanceProfileCopied] = useState(false);

  function storeColdStarts(next: MotionColdStartStats) {
    coldStartRef.current = next;
    setColdStarts(next);
    localStorage.setItem(COLD_START_STORAGE_KEY, JSON.stringify(next));
  }

  function cancelReplay() {
    replayingRef.current = false;
    setReplaying(false);
    if (replayProgressRef.current) replayProgressRef.current.value = 0;
    if (replayFrameRef.current !== null) cancelAnimationFrame(replayFrameRef.current);
    replayFrameRef.current = null;
  }

  function disposeEngine(updateUi = true) {
    activeRef.current = false;
    engineReadyRef.current = false;
    inferencePendingRef.current = false;
    frameSchedulerRef.current = {
      lastObservedVideoTime: -1,
      bufferedTimestampMs: null,
      bufferedCapturedAtMs: null,
    };
    recordingRef.current = false;
    gameRef.current = null;
    baselineRef.current = null;
    performanceProfileRef.current = null;
    spokenPerformancePhaseRef.current = null;
    spokenNextPerformancePhaseRef.current = null;
    workerGenerationRef.current += 1;
    workerRestartAttemptsRef.current = 0;
    workerStablePosesRef.current = 0;
    workerRecoveryStartedAtRef.current = null;
    if (workerRestartTimerRef.current !== null) clearTimeout(workerRestartTimerRef.current);
    workerRestartTimerRef.current = null;
    window.speechSynthesis?.cancel();
    setBaselineRunning(false);
    setBaselineElapsedMs(0);
    setBaselineNotice(null);
    setPerformanceProfileRunning(false);
    setPerformanceProfileElapsedMs(0);
    cancelReplay();
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    workerRef.current?.postMessage({ type: "dispose" });
    workerRef.current?.terminate();
    workerRef.current = null;
    mainThreadPoseRef.current?.close();
    mainThreadPoseRef.current = null;
    mainThreadStabilizerRef.current.reset();
    mainThreadLastTimestampRef.current = -1;
    poseExecutionModeRef.current = "worker";
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.onresize = null;
      videoRef.current.srcObject = null;
    }
    snapshotRef.current = null;
    recentGamePoseRef.current = null;
    lastRenderedPoseTimestampRef.current = -1;
    luminanceRef.current = null;
    fullBodyVisibleRef.current = false;
    if (canvasRef.current) drawSnapshot(canvasRef.current, null);
    if (updateUi) {
      setStatus("idle");
      setDelegate(null);
      setPoseExecutionMode("worker");
      setActualResolution(null);
      setCameraAspectRatio(null);
      setChangingResolution(false);
      setPoseVisible(false);
      setFullBodyVisible(false);
      setLuminance(null);
      setRecording(false);
      setGameView(null);
      setMetrics(EMPTY_METRICS);
      setWorkerRecoveryAttempt(null);
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      const webkitDocument = document as Document & { webkitFullscreenElement?: Element | null };
      setFullscreen(
        document.fullscreenElement === stageRef.current
        || webkitDocument.webkitFullscreenElement === stageRef.current,
      );
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    const hydrationFrame = requestAnimationFrame(() => {
      const stored = parseStoredColdStarts();
      coldStartRef.current = stored;
      setColdStarts(stored);
      try {
        const storedLang = localStorage.getItem("motion-arena-lang-v1");
        if (storedLang === "sv" || storedLang === "en") {
          arenaLanguageRef.current = storedLang;
          setArenaLanguage(storedLang);
        }
        const storedDiff = localStorage.getItem("motion-game-difficulty-v1");
        if (storedDiff === "easy" || storedDiff === "medium" || storedDiff === "hard") {
          difficultyRef.current = storedDiff;
          setDifficulty(storedDiff);
        }
      } catch {
        // Ignorera storage-fel i privat surfning
      }
    });
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      cancelAnimationFrame(hydrationFrame);
      document.body.style.overflow = bodyOverflowBeforeFullscreenRef.current;
      activeRef.current = false;
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      if (replayFrameRef.current !== null) cancelAnimationFrame(replayFrameRef.current);
      if (reportCopiedTimerRef.current !== null) clearTimeout(reportCopiedTimerRef.current);
      if (workerRestartTimerRef.current !== null) clearTimeout(workerRestartTimerRef.current);
      workerGenerationRef.current += 1;
      workerRef.current?.terminate();
      mainThreadPoseRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function playGameSound(effect: MotionGameEffect | null, finished = false) {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const frequency = finished
      ? 620
      : effect?.type === "double"
        ? 660
        : effect?.type === "hit"
          ? 520
          : effect?.type === "kick"
            ? 340
            : effect?.type === "duck"
              ? 720
              : 115;
    oscillator.type = effect?.type === "damage" || effect?.type === "miss" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    if (finished) {
      oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.22);
    } else if (effect?.type === "double") {
      oscillator.frequency.exponentialRampToValueAtTime(990, now + 0.14);
    } else if (effect?.type === "kick") {
      oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.14);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(finished ? 0.16 : 0.11, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (finished ? 0.28 : 0.14));
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + (finished ? 0.3 : 0.16));
  }

  function getBestVoice(lang: MotionArenaLanguage): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    if (lang === "en") {
      const englishVoices = voices.filter((v) => v.lang.startsWith("en"));
      if (englishVoices.length === 0) return null;
      return (
        englishVoices.find((v) => /natural|neural|online|google|siri/i.test(v.name))
        ?? englishVoices.find((v) => v.lang === "en-US" || v.lang === "en_US")
        ?? englishVoices[0]
      );
    }
    const swedishVoices = voices.filter((v) => v.lang.startsWith("sv"));
    if (swedishVoices.length === 0) return null;
    return (
      swedishVoices.find((v) => /natural|neural|online|google|siri/i.test(v.name))
      ?? swedishVoices[0]
    );
  }

  function speakBaselineInstruction(text: string) {
    if (!voiceGuidanceRef.current || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sv-SE";
    const voice = getBestVoice("sv");
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  function speakArenaInstruction(cue: MotionArenaCue) {
    if (!voiceGuidanceRef.current || !("speechSynthesis" in window)) return;
    const now = performance.now();
    if (!cue.priority && (now - lastArenaSpeechAtRef.current < 3_500 || window.speechSynthesis.speaking)) {
      return;
    }
    if (cue.priority) window.speechSynthesis.cancel();
    const lang = arenaLanguageRef.current;
    const utterance = new SpeechSynthesisUtterance(cue.text);
    utterance.lang = lang === "sv" ? "sv-SE" : "en-US";
    const voice = getBestVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.rate = cue.kind === "duck" || cue.kind === "go" || cue.kind === "countdown" ? 1.08 : 0.98;
    utterance.pitch = cue.kind === "duck" ? 1.05 : 1;
    utterance.volume = 1;
    lastArenaSpeechAtRef.current = now;
    window.speechSynthesis.speak(utterance);
  }

  function changeArenaLanguage(next: MotionArenaLanguage) {
    arenaLanguageRef.current = next;
    setArenaLanguage(next);
    try {
      localStorage.setItem("motion-arena-lang-v1", next);
    } catch {
      // Ignorera storage-fel
    }
  }

  function changeDifficulty(next: MotionGameDifficulty) {
    difficultyRef.current = next;
    setDifficulty(next);
    try {
      localStorage.setItem("motion-game-difficulty-v1", next);
    } catch {
      // Ignorera storage-fel
    }
  }

  function toggleVoiceGuidance() {
    const enabled = !voiceGuidanceRef.current;
    voiceGuidanceRef.current = enabled;
    setVoiceGuidance(enabled);
    if (enabled) {
      speakBaselineInstruction("Röst på. Jag guidar baslinjen och bossfighten.");
    } else {
      window.speechSynthesis?.cancel();
    }
  }

  function finishBaseline(now = performance.now()) {
    const baseline = baselineRef.current;
    if (!baseline) return;
    const durationMs = Math.min(BASELINE_DURATION_MS, Math.max(0, now - baseline.startedAt));
    const camera = cameraInfoRef.current;
    const report = buildMotionBaselineReport({
      samples: baseline.samples,
      createdAt: new Date().toISOString(),
      requestedResolution: camera.requestedResolution,
      actualResolution: camera.actualResolution,
      delegate: camera.delegate,
      durationMs: Math.round(durationMs),
    });
    baselineRef.current = null;
    setBaselineRunning(false);
    setBaselineElapsedMs(durationMs);
    setBaselineReport(report);
    const complete = durationMs >= BASELINE_DURATION_MS - 500;
    setBaselineNotice({ complete, durationMs });
    window.speechSynthesis?.cancel();
    if (complete) {
      playGameSound(null, true);
      speakBaselineInstruction("Tre minuter klara. Baslinjerapporten är färdig.");
    }
  }

  function sampleLighting(now: number) {
    const video = videoRef.current;
    if (
      !video ||
      replayingRef.current ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      now - lastLuminanceAtRef.current < 1_000
    ) return;
    lastLuminanceAtRef.current = now;
    const canvas = lightingCanvasRef.current ?? document.createElement("canvas");
    lightingCanvasRef.current = canvas;
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const nextLuminance = frameLuminance(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
    );
    luminanceRef.current = nextLuminance;
    setLuminance(nextLuminance);
  }

  function reportMetrics(now: number) {
    const stats = statsRef.current;
    const elapsed = now - stats.reportStartedAt;
    if (elapsed < 500) return;
    const inference = summarizeMotionMetrics(stats.inferenceSamples);
    const bufferWait = summarizeMotionMetrics(stats.bufferWaitSamples);
    const preparation = summarizeMotionMetrics(stats.preparationSamples);
    const overhead = summarizeMotionMetrics(stats.overheadSamples);
    const pipeline = summarizeMotionMetrics(stats.pipelineSamples);
    const firstRender = summarizeMotionMetrics(stats.renderSamples);
    const processedLandmarks = stats.processedLandmarks;
    const nextMetrics: MotionMetrics = {
      captureFps: rounded((stats.captures * 1000) / elapsed),
      poseHz: rounded((stats.poses * 1000) / elapsed),
      renderFps: rounded((stats.renders * 1000) / elapsed),
      inferenceP50: inference.p50,
      inferenceP95: inference.p95,
      bufferWaitP50: bufferWait.p50,
      bufferWaitP95: bufferWait.p95,
      preparationP50: preparation.p50,
      preparationP95: preparation.p95,
      overheadP50: overhead.p50,
      overheadP95: overhead.p95,
      pipelineP50: pipeline.p50,
      pipelineP95: pipeline.p95,
      firstRenderP50: firstRender.p50,
      firstRenderP95: firstRender.p95,
      heldLowConfidencePercent: rounded(
        processedLandmarks === 0 ? 0 : (stats.heldLowConfidence / processedLandmarks) * 100,
      ),
      limitedOutlierPercent: rounded(
        processedLandmarks === 0 ? 0 : (stats.limitedOutliers / processedLandmarks) * 100,
      ),
      droppedFrames: stats.dropped,
    };
    setMetrics(nextMetrics);
    const performanceProfile = performanceProfileRef.current;
    if (performanceProfile) {
      const profileElapsedMs = now - performanceProfile.startedAt;
      setPerformanceProfileElapsedMs(
        Math.min(performanceProfile.durationMs, Math.max(-GATE_B_COUNTDOWN_MS, profileElapsedMs)),
      );
      if (performanceProfile.mode === "gate-b" && profileElapsedMs >= 0) {
        const phase = gateBPhase(profileElapsedMs);
        if (phase.id !== spokenPerformancePhaseRef.current) {
          spokenPerformancePhaseRef.current = phase.id;
          spokenNextPerformancePhaseRef.current = null;
          speakBaselineInstruction(`${phase.title}. ${phase.instruction}`);
        }
        const phaseIndex = GATE_B_PHASES.findIndex((candidate) => candidate.id === phase.id);
        const nextPhase = GATE_B_PHASES[phaseIndex + 1];
        if (
          nextPhase &&
          phase.endsAtMs - profileElapsedMs <= 7_000 &&
          spokenNextPerformancePhaseRef.current !== nextPhase.id
        ) {
          spokenNextPerformancePhaseRef.current = nextPhase.id;
          speakBaselineInstruction(`Om sju sekunder: ${nextPhase.title}.`);
        }
      }
    }

    const baseline = baselineRef.current;
    if (baseline) {
      const offsetMs = now - baseline.startedAt;
      const phase = motionBaselinePhase(offsetMs);
      if (phase.id !== spokenBaselinePhaseRef.current) {
        spokenBaselinePhaseRef.current = phase.id;
        spokenNextPhaseRef.current = null;
        speakBaselineInstruction(`${phase.title}. Kamera ${phase.cameraView}. ${phase.instruction}`);
      }
      const phaseIndex = MOTION_BASELINE_PROTOCOL.findIndex((candidate) => candidate.id === phase.id);
      const nextPhase = MOTION_BASELINE_PROTOCOL[phaseIndex + 1];
      if (
        nextPhase &&
        phase.endsAtMs - offsetMs <= 7_000 &&
        spokenNextPhaseRef.current !== nextPhase.id
      ) {
        spokenNextPhaseRef.current = nextPhase.id;
        speakBaselineInstruction(`Om sju sekunder: ${nextPhase.title}. Kamera ${nextPhase.cameraView}.`);
      }
      baseline.samples.push({
        offsetMs,
        captureFps: nextMetrics.captureFps,
        poseHz: nextMetrics.poseHz,
        renderFps: nextMetrics.renderFps,
        inferenceP50: nextMetrics.inferenceP50,
        inferenceP95: nextMetrics.inferenceP95,
        posePipelineP50: nextMetrics.pipelineP50,
        posePipelineP95: nextMetrics.pipelineP95,
        firstRenderP50: nextMetrics.firstRenderP50,
        firstRenderP95: nextMetrics.firstRenderP95,
        droppedFrames: Math.max(0, stats.dropped - baseline.startingDroppedFrames),
        fullBodyVisible: fullBodyVisibleRef.current,
        luminance: luminanceRef.current,
        processedLandmarks,
        heldLowConfidence: stats.heldLowConfidence,
        limitedOutliers: stats.limitedOutliers,
      });
      setBaselineElapsedMs(Math.min(BASELINE_DURATION_MS, offsetMs));
      if (offsetMs >= BASELINE_DURATION_MS) finishBaseline(now);
    }
    stats.reportStartedAt = now;
    stats.captures = 0;
    stats.poses = 0;
    stats.renders = 0;
    stats.inferenceSamples = stats.inferenceSamples.slice(-120);
    stats.bufferWaitSamples = stats.bufferWaitSamples.slice(-120);
    stats.preparationSamples = stats.preparationSamples.slice(-120);
    stats.overheadSamples = stats.overheadSamples.slice(-120);
    stats.pipelineSamples = stats.pipelineSamples.slice(-120);
    stats.renderSamples = stats.renderSamples.slice(-120);
    stats.processedLandmarks = 0;
    stats.heldLowConfidence = 0;
    stats.limitedOutliers = 0;
  }

  function syncVideoGeometry() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!video || !canvas) return;
    const settings = track?.getSettings();
    const width = video.videoWidth || settings?.width || canvas.width;
    const height = video.videoHeight || settings?.height || canvas.height;
    if (width > 0 && height > 0) {
      canvas.width = width;
      canvas.height = height;
      const formattedResolution = `${width} × ${height}`;
      cameraInfoRef.current.actualResolution = formattedResolution;
      setActualResolution(formattedResolution);
      setCameraAspectRatio(width / height);
    }
  }

  function acceptPoseSnapshot(snapshot: MotionPoseSnapshot) {
    inferencePendingRef.current = false;
    workerStablePosesRef.current += 1;
    if (workerStablePosesRef.current >= 30) workerRestartAttemptsRef.current = 0;

    const receivedAtMs = performance.now();
    snapshotRef.current = snapshot;
    if (canStartMotionGame(snapshot)) {
      recentGamePoseRef.current = { snapshot, receivedAtMs };
    }
    const visible = snapshot.landmarks.length === 33;
    if (visible !== poseVisibleRef.current) {
      poseVisibleRef.current = visible;
      setPoseVisible(visible);
    }
    const fullBody = hasUsableFullBody(snapshot.landmarks);
    if (fullBody !== fullBodyVisibleRef.current) {
      fullBodyVisibleRef.current = fullBody;
      setFullBodyVisible(fullBody);
    }

    const stats = statsRef.current;
    const pipelineMs = receivedAtMs - snapshot.capturedAtMs;
    const bufferWaitMs = snapshot.bufferWaitMs ?? 0;
    const preparationMs = snapshot.preparationMs ?? 0;
    stats.poses += 1;
    stats.inferenceSamples.push(snapshot.inferenceMs);
    stats.bufferWaitSamples.push(bufferWaitMs);
    stats.preparationSamples.push(preparationMs);
    stats.overheadSamples.push(
      Math.max(0, pipelineMs - bufferWaitMs - preparationMs - snapshot.inferenceMs),
    );
    stats.pipelineSamples.push(pipelineMs);
    const performanceProfile = performanceProfileRef.current;
    if (performanceProfile && snapshot.capturedAtMs >= performanceProfile.startedAt) {
      performanceProfile.poses += 1;
      performanceProfile.inferenceSamples.push(snapshot.inferenceMs);
      performanceProfile.bufferWaitSamples.push(bufferWaitMs);
      performanceProfile.preparationSamples.push(preparationMs);
      performanceProfile.overheadSamples.push(
        Math.max(0, pipelineMs - bufferWaitMs - preparationMs - snapshot.inferenceMs),
      );
      performanceProfile.pipelineSamples.push(pipelineMs);
    }
    stats.processedLandmarks += snapshot.landmarks.length;
    stats.heldLowConfidence += snapshot.stabilization?.heldLowConfidence ?? 0;
    stats.limitedOutliers += snapshot.stabilization?.limitedOutliers ?? 0;

    if (recordingRef.current && recordedFramesRef.current.length < MAX_RECORDED_FRAMES) {
      recordedFramesRef.current.push({
        offsetMs: receivedAtMs - recordingStartedAtRef.current,
        inferenceMs: snapshot.inferenceMs,
        landmarks: snapshot.landmarks.map((landmark) => ({ ...landmark })),
      });
      if (recordedFramesRef.current.length % 5 === 0) {
        setRecordedFrameCount(recordedFramesRef.current.length);
      }
    }
  }

  function startRenderLoop() {
    const tick = (now: number) => {
      if (!activeRef.current) return;
      const stats = statsRef.current;
      stats.renders += 1;
      const performanceProfile = performanceProfileRef.current;
      if (
        performanceProfile &&
        now - performanceProfile.startedAt >= performanceProfile.durationMs
      ) {
        finishPerformanceProfile(now);
      } else if (performanceProfile && now >= performanceProfile.startedAt) {
        performanceProfile.renders += 1;
      }
      const canvas = canvasRef.current;
      let game = gameRef.current;
      const snapshot = snapshotRef.current;
      if (snapshot && snapshot.timestampMs !== lastRenderedPoseTimestampRef.current) {
        lastRenderedPoseTimestampRef.current = snapshot.timestampMs;
        const firstRenderMs = Math.max(0, now - snapshot.capturedAtMs);
        stats.renderSamples.push(firstRenderMs);
        const activeProfile = performanceProfileRef.current;
        if (activeProfile && snapshot.capturedAtMs >= activeProfile.startedAt) {
          activeProfile.firstRenderSamples.push(firstRenderMs);
        }
      }
      if (game && snapshot && !replayingRef.current && engineReadyRef.current) {
        const previousGame = game;
        const previousStatus = game.status;
        game = advanceMotionGame(game, snapshot, now);
        gameRef.current = game;
        const arenaCue = motionArenaCue(previousGame, game, arenaLanguageRef.current);
        if (arenaCue) speakArenaInstruction(arenaCue);
        if (game.effect && game.effect.id !== lastGameEffectIdRef.current) {
          lastGameEffectIdRef.current = game.effect.id;
          playGameSound(game.effect);
        }
        if (previousStatus !== "finished" && game.status === "finished") playGameSound(null, true);
        if (now - lastGameUiAtRef.current >= 100 || previousStatus !== game.status) {
          lastGameUiAtRef.current = now;
          setGameView(game);
        }
      }
      if (canvas) {
        drawSnapshot(canvas, snapshot);
        drawMotionGame(canvas, game, now, arenaLanguageRef.current);
      }

      const video = videoRef.current;
      if (
        !replayingRef.current &&
        engineReadyRef.current &&
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        const decision = scheduleMotionVideoFrame(
          frameSchedulerRef.current,
          video.currentTime,
          inferencePendingRef.current,
          now,
        );
        frameSchedulerRef.current = decision.state;
        stats.captures += decision.capturedFrames;
        stats.dropped += decision.droppedFrames;
        const activeProfile = performanceProfileRef.current;
        if (activeProfile && now >= activeProfile.startedAt) {
          activeProfile.captures += decision.capturedFrames;
          activeProfile.droppedFrames += decision.droppedFrames;
        }
        if (decision.submitTimestampMs !== null) {
          inferencePendingRef.current = true;
          const capturedAtMs = decision.submitCapturedAtMs ?? performance.now();
          const timestampMs = decision.submitTimestampMs;
          const preparationStartedAtMs = performance.now();
          const bufferWaitMs = Math.max(0, preparationStartedAtMs - capturedAtMs);
          if (poseExecutionModeRef.current === "main-thread") {
            const preparationMs = performance.now() - preparationStartedAtMs;
            window.setTimeout(() => {
              const landmarker = mainThreadPoseRef.current;
              if (!activeRef.current || !landmarker) {
                inferencePendingRef.current = false;
                return;
              }
              const safeTimestampMs = nextMotionTimestampMs(
                timestampMs,
                mainThreadLastTimestampRef.current,
              );
              mainThreadLastTimestampRef.current = safeTimestampMs;
              const inferenceStartedAtMs = performance.now();
              try {
                let rawLandmarks: MotionLandmark[] = [];
                landmarker.detectForVideo(video, safeTimestampMs, (result) => {
                  rawLandmarks = (result.landmarks[0] ?? []).map((landmark) => ({
                    x: landmark.x,
                    y: landmark.y,
                    z: landmark.z,
                    visibility: landmark.visibility ?? null,
                  }));
                });
                const inferenceMs = performance.now() - inferenceStartedAtMs;
                const stabilized = mainThreadStabilizerRef.current.stabilize(
                  rawLandmarks,
                  safeTimestampMs,
                );
                acceptPoseSnapshot({
                  capturedAtMs,
                  bufferWaitMs,
                  inferenceMs,
                  preparationMs,
                  landmarks: stabilized.landmarks,
                  stabilization: stabilized.diagnostics,
                  timestampMs: safeTimestampMs,
                });
              } catch (caught) {
                inferencePendingRef.current = false;
                engineReadyRef.current = false;
                setStatus("error");
                setError(`Mobilens posemotor stoppades: ${cameraFailureMessage(caught)}`);
              }
            }, 0);
            sampleLighting(now);
            reportMetrics(now);
            animationFrameRef.current = requestAnimationFrame(tick);
            return;
          }
          void createImageBitmap(video)
            .then((frame) => {
              if (!activeRef.current || !workerRef.current) {
                frame.close();
                inferencePendingRef.current = false;
                return;
              }
              const preparationMs = performance.now() - preparationStartedAtMs;
              workerRef.current.postMessage(
                { type: "frame", bufferWaitMs, capturedAtMs, frame, preparationMs, timestampMs },
                [frame],
              );
            })
            .catch((caught) => {
              inferencePendingRef.current = false;
              setError(cameraFailureMessage(caught));
            });
        }
      }

      sampleLighting(now);
      reportMetrics(now);
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
  }

  async function startCamera() {
    disposeEngine();
    const attempted = registerColdStartAttempt(coldStartRef.current);
    storeColdStarts(attempted);
    setError(null);
    setStatus("requesting");
    setPoseVisible(false);
    poseVisibleRef.current = false;
    setFullBodyVisible(false);
    fullBodyVisibleRef.current = false;
    setLuminance(null);
    luminanceRef.current = null;
    cameraInfoRef.current = {
      requestedResolution: resolution.replace("x", " × "),
      actualResolution: "unknown",
      delegate: "unknown",
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Webbläsaren saknar stöd för kamerainmatning. Öppna sidan via HTTPS eller localhost.");
      }
      const [width, height] = resolution.split("x").map(Number);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: 30, min: 24 },
          facingMode: "user",
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error("Motion Lab kunde inte skapa videoytan.");
      video.srcObject = stream;
      await video.play();
      canvas.width = video.videoWidth || width;
      canvas.height = video.videoHeight || height;
      video.onresize = syncVideoGeometry;
      syncVideoGeometry();

      setStatus("loading");
      activeRef.current = true;
      frameSchedulerRef.current = {
        lastObservedVideoTime: -1,
        bufferedTimestampMs: null,
        bufferedCapturedAtMs: null,
      };
      lastRenderedPoseTimestampRef.current = -1;
      lastLuminanceAtRef.current = 0;
      statsRef.current = {
        reportStartedAt: performance.now(),
        captures: 0,
        poses: 0,
        renders: 0,
        dropped: 0,
        inferenceSamples: [],
        bufferWaitSamples: [],
        preparationSamples: [],
        overheadSamples: [],
        pipelineSamples: [],
        renderSamples: [],
        processedLandmarks: 0,
        heldLowConfidence: 0,
        limitedOutliers: 0,
      };

      async function launchMainThreadPose(countsAsColdStart: boolean) {
        const generation = ++workerGenerationRef.current;
        poseExecutionModeRef.current = "main-thread";
        setPoseExecutionMode("main-thread");
        setStatus("loading");
        try {
          const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
          const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
          const options = (preferredDelegate: "GPU" | "CPU") => ({
            baseOptions: { modelAssetPath: MODEL_ASSET, delegate: preferredDelegate },
            runningMode: "VIDEO" as const,
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false,
          });
          let selectedDelegate: "GPU" | "CPU" = "GPU";
          let landmarker: PoseLandmarker;
          try {
            landmarker = await PoseLandmarker.createFromOptions(vision, options("GPU"));
          } catch {
            selectedDelegate = "CPU";
            landmarker = await PoseLandmarker.createFromOptions(vision, options("CPU"));
          }
          if (!activeRef.current || generation !== workerGenerationRef.current) {
            landmarker.close();
            return;
          }
          mainThreadPoseRef.current = landmarker;
          mainThreadStabilizerRef.current.reset();
          mainThreadLastTimestampRef.current = -1;
          const recoveryStartedAt = workerRecoveryStartedAtRef.current;
          if (recoveryStartedAt !== null) {
            const game = gameRef.current;
            if (game) {
              const resumed = pauseMotionGameFor(game, performance.now() - recoveryStartedAt);
              gameRef.current = resumed;
              setGameView(resumed);
            }
            workerRecoveryStartedAtRef.current = null;
          }
          engineReadyRef.current = true;
          cameraInfoRef.current.delegate = selectedDelegate;
          setDelegate(selectedDelegate);
          setError(null);
          setWorkerRecoveryAttempt(null);
          setStatus("running");
          if (countsAsColdStart) {
            storeColdStarts(registerColdStartSuccess(coldStartRef.current));
          }
        } catch (caught) {
          if (!activeRef.current || generation !== workerGenerationRef.current) return;
          engineReadyRef.current = false;
          setStatus("error");
          setError(`Mobilens posemotor kunde inte starta: ${cameraFailureMessage(caught)}`);
        }
      }

      function failOrRestartWorker(
        message: string,
        generation: number,
        countsAsColdStart: boolean,
      ) {
        if (!activeRef.current || generation !== workerGenerationRef.current) return;
        inferencePendingRef.current = false;
        engineReadyRef.current = false;
        workerGenerationRef.current += 1;
        workerRef.current?.terminate();
        workerRef.current = null;
        workerStablePosesRef.current = 0;
        const activeProfile = performanceProfileRef.current;
        if (activeProfile && performance.now() >= activeProfile.startedAt) {
          activeProfile.workerRestarts += 1;
        }
        if (/document/i.test(message)) {
          workerRecoveryStartedAtRef.current ??= performance.now();
          setError(null);
          setWorkerRecoveryAttempt(null);
          void launchMainThreadPose(countsAsColdStart);
          return;
        }

        const attempt = workerRestartAttemptsRef.current + 1;
        workerRestartAttemptsRef.current = attempt;
        if (attempt > MOTION_WORKER_MAX_RESTARTS) {
          activeRef.current = false;
          gameRef.current = null;
          setGameView(null);
          window.speechSynthesis?.cancel();
          setWorkerRecoveryAttempt(null);
          setError(`Posemotorn kunde inte återhämta sig efter ${MOTION_WORKER_MAX_RESTARTS} försök: ${message}`);
          setStatus("error");
          return;
        }

        workerRecoveryStartedAtRef.current ??= performance.now();
        setError(null);
        setWorkerRecoveryAttempt(attempt);
        setStatus("recovering");
        const delayMs = motionWorkerRetryDelayMs(attempt);
        workerRestartTimerRef.current = setTimeout(() => {
          workerRestartTimerRef.current = null;
          if (activeRef.current) launchPoseWorker(false);
        }, delayMs);
      }

      function launchPoseWorker(countsAsColdStart: boolean) {
        const generation = ++workerGenerationRef.current;
        poseExecutionModeRef.current = "worker";
        setPoseExecutionMode("worker");
        const worker = new Worker(new URL("../../workers/pose.worker.ts", import.meta.url), {
          type: "module",
          name: "projekt100-pose",
        });
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<PoseWorkerMessage>) => {
          if (generation !== workerGenerationRef.current) return;
          const message = event.data;
          if (message.type === "ready") {
            inferencePendingRef.current = false;
            const recoveryStartedAt = workerRecoveryStartedAtRef.current;
            if (recoveryStartedAt !== null) {
              const game = gameRef.current;
              if (game) {
                const resumed = pauseMotionGameFor(game, performance.now() - recoveryStartedAt);
                gameRef.current = resumed;
                setGameView(resumed);
              }
              workerRecoveryStartedAtRef.current = null;
            }
            engineReadyRef.current = true;
            cameraInfoRef.current.delegate = message.delegate;
            setDelegate(message.delegate);
            setError(null);
            setWorkerRecoveryAttempt(null);
            setStatus("running");
            if (countsAsColdStart) {
              storeColdStarts(registerColdStartSuccess(coldStartRef.current));
            }
            return;
          }
          if (message.type === "error") {
            failOrRestartWorker(message.message, generation, countsAsColdStart);
            return;
          }
          acceptPoseSnapshot(message.snapshot);
        };
        worker.onerror = (event) => {
          failOrRestartWorker(event.message || "okänt workerfel", generation, countsAsColdStart);
        };
        worker.postMessage({ type: "init", wasmRoot: WASM_ROOT, modelAssetPath: MODEL_ASSET });
      }

      workerRestartAttemptsRef.current = 0;
      workerStablePosesRef.current = 0;
      workerRecoveryStartedAtRef.current = null;
      if (needsMainThreadPose()) {
        void launchMainThreadPose(true);
      } else {
        launchPoseWorker(true);
      }
      startRenderLoop();
    } catch (caught) {
      const message = cameraFailureMessage(caught);
      disposeEngine(false);
      setError(message);
      setStatus("error");
    }
  }

  function beginRecording() {
    setError(null);
    recordedFramesRef.current = [];
    recordingStartedAtRef.current = performance.now();
    recordingRef.current = true;
    setRecordingData(null);
    setRecordedFrameCount(0);
    setRecording(true);
  }

  function finishRecording() {
    recordingRef.current = false;
    setRecording(false);
    setRecordedFrameCount(recordedFramesRef.current.length);
    if (recordedFramesRef.current.length < 2) {
      setRecordingData(null);
      setError("Replay behöver minst två poseframes. Se till att 33 landmarks är grönt och spela in igen.");
      return;
    }
    setError(null);
    setRecordingData(createMotionRecording(recordedFramesRef.current, new Date().toISOString()));
  }

  function replayRecording() {
    if (!recordingData || recordingData.frames.length === 0) return;
    gameRef.current = null;
    setGameView(null);
    cancelReplay();
    replayingRef.current = true;
    setReplaying(true);
    let frameIndex = 0;
    const startedAt = performance.now();
    const firstFrame = recordingData.frames[0];
    snapshotRef.current = {
      capturedAtMs: startedAt,
      timestampMs: 0,
      inferenceMs: firstFrame.inferenceMs,
      landmarks: firstFrame.landmarks,
    };
    if (canvasRef.current) drawSnapshot(canvasRef.current, snapshotRef.current);
    const replayTick = (now: number) => {
      if (!replayingRef.current) return;
      const elapsed = now - startedAt;
      while (
        frameIndex + 1 < recordingData.frames.length &&
        recordingData.frames[frameIndex + 1].offsetMs <= elapsed
      ) {
        frameIndex += 1;
      }
      const frame = recordingData.frames[frameIndex];
      snapshotRef.current = {
        capturedAtMs: now,
        timestampMs: frame.offsetMs,
        inferenceMs: frame.inferenceMs,
        landmarks: frame.landmarks,
      };
      if (canvasRef.current) drawSnapshot(canvasRef.current, snapshotRef.current);
      if (replayProgressRef.current) {
        replayProgressRef.current.value =
          recordingData.durationMs <= 0 ? 1 : Math.min(1, elapsed / recordingData.durationMs);
      }
      if (elapsed >= recordingData.durationMs) {
        cancelReplay();
        return;
      }
      replayFrameRef.current = requestAnimationFrame(replayTick);
    };
    replayFrameRef.current = requestAnimationFrame(replayTick);
  }

  function downloadRecording() {
    if (!recordingData) return;
    const blob = new Blob([JSON.stringify(recordingData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `motion-landmarks-${recordingData.createdAt.replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetColdStarts() {
    storeColdStarts({ attempts: 0, successes: 0 });
  }

  function simulateWorkerFailure() {
    if (!engineReadyRef.current || !workerRef.current) return;
    workerRef.current.postMessage({ type: "simulate-error" });
  }

  function startPerformanceProfile(mode: PerformanceProfileMode) {
    if (!activeRef.current || !engineReadyRef.current) {
      setError("Starta kameran innan prestandamätningen.");
      return;
    }
    stopGame();
    cancelReplay();
    setError(null);
    setPerformanceProfileReport(null);
    setPerformanceProfileCopied(false);
    const leadInMs = mode === "gate-b" ? GATE_B_COUNTDOWN_MS : 0;
    const durationMs = mode === "gate-b" ? GATE_B_DURATION_MS : QUICK_PROFILE_DURATION_MS;
    setPerformanceProfileMode(mode);
    setPerformanceProfileElapsedMs(-leadInMs);
    spokenPerformancePhaseRef.current = null;
    spokenNextPerformancePhaseRef.current = null;
    performanceProfileRef.current = {
      mode,
      durationMs,
      startedAt: performance.now() + leadInMs,
      captures: 0,
      poses: 0,
      renders: 0,
      droppedFrames: 0,
      workerRestarts: 0,
      inferenceSamples: [],
      bufferWaitSamples: [],
      preparationSamples: [],
      overheadSamples: [],
      pipelineSamples: [],
      firstRenderSamples: [],
    };
    setPerformanceProfileRunning(true);
    if (mode === "gate-b") {
      speakBaselineInstruction("Gate B startar om sju sekunder. Gå till din plats och stå framifrån. Jag guidar hela testet.");
    }
  }

  function finishPerformanceProfile(now = performance.now()) {
    const profile = performanceProfileRef.current;
    if (!profile) return;
    const report = buildMotionPerformanceProfile({
      ...profile,
      protocol: profile.mode === "gate-b" ? "gate-b-10m-v1" : "quick-30s-v2",
      createdAt: new Date().toISOString(),
      durationMs: Math.max(0, now - profile.startedAt),
      requestedDurationMs: profile.durationMs,
      requestedResolution: cameraInfoRef.current.requestedResolution,
      actualResolution: cameraInfoRef.current.actualResolution,
      delegate: cameraInfoRef.current.delegate,
    });
    performanceProfileRef.current = null;
    setPerformanceProfileRunning(false);
    setPerformanceProfileElapsedMs(report.durationMs);
    setPerformanceProfileReport(report);
    spokenPerformancePhaseRef.current = null;
    spokenNextPerformancePhaseRef.current = null;
    if (profile.mode === "gate-b" && report.durationMs >= GATE_B_DURATION_MS - 500) {
      playGameSound(null, true);
      speakBaselineInstruction("Tio minuter klara. Gate B-rapporten är färdig.");
    }
  }

  function downloadPerformanceProfile() {
    if (!performanceProfileReport) return;
    const blob = new Blob([JSON.stringify(performanceProfileReport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${performanceProfileReport.protocol}-${performanceProfileReport.createdAt.replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyPerformanceProfile() {
    if (!performanceProfileReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(performanceProfileReport, null, 2));
      setPerformanceProfileCopied(true);
    } catch {
      setError("Profilrapporten kunde inte kopieras. Ladda ned JSON-filen i stället.");
    }
  }

  function startBaseline() {
    if (!activeRef.current || !engineReadyRef.current) {
      setError("Starta kameran innan baslinjemätningen.");
      return;
    }
    if (recordingRef.current) {
      setError("Stoppa landmark-inspelningen innan baslinjemätningen startar.");
      return;
    }
    if (performanceProfileRef.current) {
      setError("Stoppa prestandamätningen innan baslinjen startar.");
      return;
    }
    stopGame();
    cancelReplay();
    setError(null);
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    void audioContextRef.current.resume();
    const now = performance.now();
    spokenBaselinePhaseRef.current = null;
    spokenNextPhaseRef.current = null;
    baselineRef.current = {
      startedAt: now,
      startingDroppedFrames: statsRef.current.dropped,
      samples: [],
    };
    setBaselineReport(null);
    setBaselineNotice(null);
    setReportCopied(false);
    setBaselineElapsedMs(0);
    setBaselineRunning(true);
  }

  function downloadBaselineReport() {
    if (!baselineReport) return;
    const blob = new Blob([JSON.stringify(baselineReport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `motion-baseline-${baselineReport.createdAt.replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyBaselineReport() {
    if (!baselineReport) return;
    try {
      const reportJson = JSON.stringify(baselineReport, null, 2);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportJson);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = reportJson;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand("copy");
        textArea.remove();
        if (!copied) throw new Error("copy failed");
      }
      setReportCopied(true);
      if (reportCopiedTimerRef.current !== null) clearTimeout(reportCopiedTimerRef.current);
      reportCopiedTimerRef.current = setTimeout(() => setReportCopied(false), 2_000);
    } catch {
      setError("Webbläsaren kunde inte kopiera rapporten. Använd Ladda ned rapport (.json) i stället.");
    }
  }

  async function changeResolution(next: Resolution) {
    setResolution(next);
    cameraInfoRef.current.requestedResolution = next.replace("x", " × ");
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || status !== "running") return;

    stopGame();
    setChangingResolution(true);
    setError(null);
    const [width, height] = next.split("x").map(Number);
    try {
      try {
        await track.applyConstraints({
          width: { exact: width },
          height: { exact: height },
          frameRate: { ideal: 30, min: 24 },
        });
      } catch {
        await track.applyConstraints({
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: 30, min: 24 },
        });
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      syncVideoGeometry();
    } catch (caught) {
      setError(cameraFailureMessage(caught));
    } finally {
      setChangingResolution(false);
    }
  }

  function startGame() {
    if (baselineRef.current) {
      setError("Avsluta baslinjemätningen innan bossfighten startar.");
      return;
    }
    if (performanceProfileRef.current) {
      setError("Stoppa prestandamätningen innan bossfighten startar.");
      return;
    }
    if (!activeRef.current || !engineReadyRef.current) {
      setError("Starta kameran och vänta tills posemotorn är redo innan bossfighten startar.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      setError("Spelytan är inte redo ännu. Ladda om sidan och försök igen.");
      return;
    }
    const currentSnapshot = snapshotRef.current;
    const recentPose = recentGamePoseRef.current;
    const snapshot =
      currentSnapshot && canStartMotionGame(currentSnapshot)
        ? currentSnapshot
        : recentPose && performance.now() - recentPose.receivedAtMs <= 3_000
          ? recentPose.snapshot
          : null;
    if (!snapshot) {
      setError("Visa huvud och båda axlarna för kameran. Benen behöver inte synas för att starta bossfighten.");
      return;
    }
    cancelReplay();
    setError(null);
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    void audioContextRef.current.resume();
    const diff = difficultyRef.current;
    const game = startMotionGame(snapshot, performance.now(), canvas.width / canvas.height, {
      difficulty: diff,
      allowKicks: fullBodyVisibleRef.current,
    });
    if (!game) {
      setError("Kunde inte läsa båda axlarna. Vänd dig mot kameran och försök igen.");
      return;
    }
    gameRef.current = game;
    lastGameEffectIdRef.current = null;
    lastGameUiAtRef.current = performance.now();
    lastArenaSpeechAtRef.current = -Infinity;
    setGameView(game);
    speakArenaInstruction(motionArenaStartCue(arenaLanguageRef.current, diff));
  }

  function stopGame() {
    gameRef.current = null;
    setGameView(null);
    window.speechSynthesis?.cancel();
  }

  async function toggleFullscreen() {
    const stage = stageRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    const webkitDocument = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };
    if (!stage) return;

    if (viewportFullscreen) {
      document.body.style.overflow = bodyOverflowBeforeFullscreenRef.current;
      setViewportFullscreen(false);
      setFullscreen(false);
      return;
    }
    if (document.fullscreenElement || webkitDocument.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        await webkitDocument.webkitExitFullscreen?.();
      }
      return;
    }

    try {
      if (stage.requestFullscreen) {
        await stage.requestFullscreen();
        return;
      }
      if (stage.webkitRequestFullscreen) {
        await stage.webkitRequestFullscreen();
        return;
      }
    } catch {
      // iPhone kan exponera Fullscreen API utan att tillåta interaktiva element.
    }
    bodyOverflowBeforeFullscreenRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setViewportFullscreen(true);
    setFullscreen(true);
  }

  const isStarting = status === "requesting" || status === "loading";
  const isRecovering = status === "recovering";
  const isLive = status === "running" || isRecovering;
  const gameActive = gameView?.status === "countdown" || gameView?.status === "running";
  const gameSeconds = gameView ? motionGameSecondsRemaining(gameView) : 60;
  const [requestedWidth, requestedHeight] = resolution.split("x");
  const lightOkay = luminance !== null && luminance >= DARK_LUMINANCE_THRESHOLD;
  const baselineProgress = Math.min(100, (baselineElapsedMs / BASELINE_DURATION_MS) * 100);
  const performanceProfileDurationMs = performanceProfileMode === "gate-b"
    ? GATE_B_DURATION_MS
    : QUICK_PROFILE_DURATION_MS;
  const performanceProfileCountdown = Math.max(
    0,
    Math.ceil(-performanceProfileElapsedMs / 1_000),
  );
  const performanceProfileSecondsLeft = Math.max(
    0,
    Math.ceil((performanceProfileDurationMs - Math.max(0, performanceProfileElapsedMs)) / 1_000),
  );
  const performanceProfileProgress = Math.min(
    100,
    (Math.max(0, performanceProfileElapsedMs) / performanceProfileDurationMs) * 100,
  );
  const performanceGatePhase = gateBPhase(Math.max(0, performanceProfileElapsedMs));
  const performanceGatePhaseIndex = GATE_B_PHASES.findIndex(
    (phase) => phase.id === performanceGatePhase.id,
  );
  const nextPerformanceGatePhase = GATE_B_PHASES[performanceGatePhaseIndex + 1] ?? null;
  const performanceGatePhaseSecondsLeft = Math.max(
    0,
    Math.ceil((performanceGatePhase.endsAtMs - Math.max(0, performanceProfileElapsedMs)) / 1_000),
  );
  const baselinePassedChecks = baselineReport
    ? Object.values(baselineReport.checks).filter(Boolean).length
    : 0;
  const baselinePhase = motionBaselinePhase(baselineElapsedMs);
  const baselinePhaseIndex = MOTION_BASELINE_PROTOCOL.findIndex(
    (phase) => phase.id === baselinePhase.id,
  );
  const nextBaselinePhase = MOTION_BASELINE_PROTOCOL[baselinePhaseIndex + 1] ?? null;
  const baselinePhaseSecondsLeft = Math.max(
    0,
    Math.ceil((baselinePhase.endsAtMs - baselineElapsedMs) / 1000),
  );
  const showNextBaselinePhase = baselineRunning && nextBaselinePhase && baselinePhaseSecondsLeft <= 7;

  return (
    <div className="p100-motion-lab">
      <header className="p100-page-head p100-motion-head">
        <div>
          <span>Motion Engine · Steg 2–7</span>
          <h1>Motion Lab</h1>
          <p>Ställ dig framför kameran. Kroppen blir indata och allt bildmaterial stannar i webbläsaren.</p>
        </div>
        <div className="p100-head-actions">
          <Link className="p100-button-secondary" href="/projekt-100/traning">Till träningen</Link>
          <button
            className="p100-button p100-button-bossfight"
            type="button"
            onClick={startGame}
            disabled={replaying || gameActive || baselineRunning || performanceProfileRunning}
            title={!isLive ? "Tryck för att se vad som saknas" : !poseVisible ? "Tryck för hjälp med kroppspositionen" : baselineRunning ? "Baslinjemätningen pågår" : performanceProfileRunning ? "Prestandamätningen pågår" : gameActive ? "Bossfighten pågår" : "Starta bossfight"}
          >
            <Swords /> {gameActive ? "Bossfight pågår" : "Starta bossfight"}
          </button>
          {isLive || isStarting || status === "error" ? (
            <button className="p100-button-secondary" type="button" onClick={() => disposeEngine()}>
              <VideoOff /> Stäng kamera
            </button>
          ) : null}
          <button className="p100-button" type="button" onClick={() => void startCamera()} disabled={isStarting || isRecovering}>
            {isStarting || isRecovering ? <RefreshCw className="p100-spin" /> : <Camera />}
            {status === "requesting" ? "Väntar på tillstånd…" : status === "loading" ? "Laddar posemotor…" : isRecovering ? "Återansluter…" : "Starta kamera"}
          </button>
        </div>
      </header>

      <section className="p100-motion-grid">
        <div ref={stageRef} className={`p100-motion-stage ${replaying ? "replaying" : ""} ${gameActive ? "game-active" : ""} ${viewportFullscreen ? "viewport-fullscreen" : ""}`} style={{ aspectRatio: cameraAspectRatio ?? `${requestedWidth} / ${requestedHeight}` }}>
          <video ref={videoRef} muted playsInline aria-label="Spegelvänd kamerabild" />
          <canvas ref={canvasRef} aria-label="Pose-overlay med kroppens landmärken" />
          <div className="p100-motion-stage-top">
            <span className={`p100-motion-live ${isLive ? "active" : ""}`}><Radio /> {isRecovering ? "Pose återansluter" : isLive ? "Kamera aktiv" : "Kamera av"}</span>
            {delegate ? <span className="engine">{delegate} · {poseExecutionMode === "main-thread" ? "Mobilmotor" : "Worker"}</span> : null}
            {replaying ? <span className="replay">Replay</span> : null}
            {gameActive ? <span className="game"><Swords /> Bossfight</span> : null}
            {baselineRunning ? <span className="baseline"><Gauge /> Baseline {baselineClock(baselineElapsedMs)}</span> : null}
            {performanceProfileRunning ? <span className="profile"><Gauge /> {performanceProfileMode === "gate-b" ? `Gate B ${remainingClock(GATE_B_DURATION_MS, performanceProfileElapsedMs)}` : `Profil ${performanceProfileSecondsLeft} s`}</span> : null}
            {gameActive ? <button type="button" className="p100-motion-game-stop" onClick={stopGame} title="Avsluta rundan" aria-label="Avsluta rundan"><X /></button> : null}
            <button
              type="button"
              className="p100-motion-fullscreen"
              onClick={() => void toggleFullscreen()}
              aria-label={fullscreen ? "Lämna helskärm" : "Visa i helskärm"}
              title={fullscreen ? "Lämna helskärm" : "Visa i helskärm"}
            >
              {fullscreen ? <Minimize /> : <Maximize />}<span>{fullscreen ? "Stäng" : "Helskärm"}</span>
            </button>
            <button
              type="button"
              className={`p100-motion-voice-toggle ${voiceGuidance ? "active" : ""}`}
              onClick={toggleVoiceGuidance}
              aria-pressed={voiceGuidance}
              title={voiceGuidance ? "Stäng av röstguide och Arena-röst" : "Slå på röstguide och Arena-röst"}
            >
              {voiceGuidance ? <Volume2 /> : <VolumeX />}<span>Röst</span>
            </button>
          </div>
          {status === "idle" ? (
            <div className="p100-motion-stage-empty">
              <span><Video /></span>
              <strong>Redo för första rörelsen</strong>
              <p>Välj bildläge, tillåt kameran och se till att hela kroppen ryms i bild.</p>
              <button type="button" onClick={() => void startCamera()}><Play /> Starta Motion Lab</button>
            </div>
          ) : null}
          {isStarting ? (
            <div className="p100-motion-stage-empty loading">
              <span><RefreshCw /></span>
              <strong>{status === "requesting" ? "Startar kameran" : "Laddar lokal poseanalys"}</strong>
              <p>Första modellstarten kan ta några sekunder. Inga videor laddas upp.</p>
            </div>
          ) : null}
          {isLive && !isRecovering && (!poseVisible || !fullBodyVisible) && !replaying && !gameActive && !performanceProfileRunning ? (
            <div className="p100-motion-guide">
              <strong>{poseVisible ? "Hela kroppen behöver synas" : "Ingen kropp hittad ännu"}</strong>
              <span>Backa, centrera dig och se till att huvud, höfter och knän ryms i bild.</span>
            </div>
          ) : null}
          {baselineRunning ? (
            <div className="p100-motion-baseline-hud" aria-live="polite">
              <div className="p100-motion-baseline-hud-time">
                <span><Gauge /> Baslinjemätning pågår</span>
                <strong>{baselineClock(baselineElapsedMs)}</strong>
                <small>{Math.floor(baselineProgress)}% · stoppar automatiskt vid 3:00</small>
              </div>
              <div className="p100-motion-baseline-hud-instruction">
                <small>Moment {baselinePhaseIndex + 1}/{MOTION_BASELINE_PROTOCOL.length} · kamera {baselinePhase.cameraView}</small>
                <strong>{baselinePhase.title}</strong>
                <p>{baselinePhase.instruction}</p>
              </div>
              {showNextBaselinePhase ? (
                <div className="p100-motion-baseline-next">
                  <small>Nästa om {baselinePhaseSecondsLeft} sek</small>
                  <strong>{nextBaselinePhase.title} · {nextBaselinePhase.cameraView}</strong>
                </div>
              ) : null}
              <div className="p100-motion-baseline-hud-progress"><span style={{ width: `${baselineProgress}%` }} /></div>
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
                    <small>Moment {performanceGatePhaseIndex + 1}/{GATE_B_PHASES.length}</small>
                    <strong>{performanceGatePhase.title}</strong>
                    <p>{performanceGatePhase.instruction}</p>
                  </div>
                  {nextPerformanceGatePhase && performanceGatePhaseSecondsLeft <= 7 ? (
                    <div className="p100-motion-baseline-next">
                      <small>Nästa om {performanceGatePhaseSecondsLeft} sek</small>
                      <strong>{nextPerformanceGatePhase.title}</strong>
                    </div>
                  ) : null}
                  <div className="p100-motion-baseline-hud-progress"><span style={{ width: `${performanceProfileProgress}%` }} /></div>
                </>
              )}
            </div>
          ) : null}
          {baselineNotice && baselineReport ? (
            <div className={`p100-motion-baseline-done ${baselineNotice.complete ? "complete" : "partial"}`} role="status">
              <button type="button" className="close" onClick={() => setBaselineNotice(null)} aria-label="Stäng meddelandet"><X /></button>
              <span className="icon">{baselineNotice.complete ? <Check /> : <CircleStop />}</span>
              <small>{baselineNotice.complete ? "Automatisk mätning slutförd" : "Delrapport skapad"}</small>
              <strong>{baselineNotice.complete ? "3 minuter klara!" : `Stoppad efter ${elapsedClock(baselineNotice.durationMs)}`}</strong>
              <p>{baselineNotice.complete ? "Rapporten är färdig att ladda ned eller kopiera." : "Starta igen och låt timern nå 0:00 för en fullständig rapport."}</p>
              <div>
                <button type="button" onClick={downloadBaselineReport}><Download /> Ladda ned rapport (.json)</button>
                <button type="button" onClick={() => void copyBaselineReport()}>{reportCopied ? <Check /> : <Copy />} {reportCopied ? "Kopierad" : "Kopiera"}</button>
              </div>
            </div>
          ) : null}
          {gameView && gameActive ? (
            <div className="p100-motion-game-hud">
              <div><small>Poäng</small><strong>{gameView.score.toLocaleString("sv-SE")}</strong></div>
              <div><small>Combo</small><strong>×{gameView.combo}</strong></div>
              <div className="hearts" aria-label={`${gameView.hearts} liv kvar`}>
                {[0, 1, 2].map((heart) => <Heart key={heart} className={heart < gameView.hearts ? "alive" : ""} />)}
              </div>
              <div className="time"><small>Tid</small><strong>{gameSeconds}</strong></div>
            </div>
          ) : null}
          {gameView?.status === "countdown" ? (
            <div className="p100-motion-countdown">
              <small>{arenaLanguage === "sv" ? "Gå till din plats · kalibrerar live" : "Take your position · live calibration"}</small>
              <strong>{motionGameCountdown(gameView)}</strong>
              <span>{arenaLanguage === "sv" ? "Slå målen. Ducka under den röda vågen." : "Strike targets. Duck under the red wave."}</span>
            </div>
          ) : null}
          {gameView?.duck ? (
            <div className={`p100-motion-duck-callout ${gameView.nowMs >= gameView.duck.activeAt ? "active" : ""}`}>
              <strong>{gameView.nowMs >= gameView.duck.activeAt ? (arenaLanguage === "sv" ? "DUCKA!" : "DUCK!") : (arenaLanguage === "sv" ? "GÖR DIG REDO" : "GET READY")}</strong>
            </div>
          ) : null}
          {isLive && !isRecovering && poseVisible && !replaying && !gameView && !baselineRunning && !performanceProfileRunning ? (
            <button type="button" className="p100-motion-game-launch" onClick={startGame}>
              <Swords />{" "}
              {arenaLanguage === "sv"
                ? `Starta 60 s bossfight (${difficulty === "easy" ? "Lätt" : difficulty === "hard" ? "Svår" : "Medel"})`
                : `Start 60s Boss Fight (${difficulty === "easy" ? "Easy" : difficulty === "hard" ? "Hard" : "Medium"})`}
            </button>
          ) : null}
          {gameView?.status === "finished" ? (
            <div className="p100-motion-game-result" role="dialog" aria-label="Resultat från bossfight">
              <small>{gameView.finishReason === "hearts" ? (arenaLanguage === "sv" ? "Neonväktaren vann den här gången" : "Neon Guardian won this round") : (arenaLanguage === "sv" ? "Rundan klar" : "Round clear")}</small>
              <strong>{gameView.score.toLocaleString(arenaLanguage === "sv" ? "sv-SE" : "en-US")} {arenaLanguage === "sv" ? "poäng" : "pts"}</strong>
              <p>{gameView.hits} {arenaLanguage === "sv" ? "träffar" : "hits"} · {gameView.dodges} {arenaLanguage === "sv" ? "duckningar" : "dodges"} · {arenaLanguage === "sv" ? "bästa combo" : "best combo"} ×{gameView.bestCombo}</p>
              <div className="p100-motion-game-result-actions">
                <button type="button" className="p100-motion-game-result-primary" onClick={startGame}>
                  <RefreshCw /> {arenaLanguage === "sv" ? "Kör igen" : "Play again"}
                </button>
                {fullscreen ? (
                  <button
                    type="button"
                    className="p100-motion-game-result-secondary fullscreen-exit"
                    onClick={() => void toggleFullscreen()}
                    title={arenaLanguage === "sv" ? "Lämna helskärm" : "Exit fullscreen"}
                    aria-label={arenaLanguage === "sv" ? "Avsluta helskärm" : "Exit fullscreen"}
                  >
                    <Minimize /> {arenaLanguage === "sv" ? "Avsluta helskärm" : "Exit fullscreen"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="p100-motion-game-result-secondary"
                  onClick={stopGame}
                  title={arenaLanguage === "sv" ? "Stäng rundan och gå tillbaka till labbet" : "Close round and return to lab"}
                  aria-label={arenaLanguage === "sv" ? "Avsluta runda" : "Close round"}
                >
                  <CircleStop /> {arenaLanguage === "sv" ? "Avsluta runda" : "Close round"}
                </button>
              </div>
            </div>
          ) : null}
          {replaying && recordingData ? (
            <div className="p100-motion-replay-hud" aria-live="polite">
              <div><Play /><strong>Landmark-replay</strong><span>{recordingData.frameCount} frames · {(recordingData.durationMs / 1000).toFixed(1)} s</span></div>
              <progress ref={replayProgressRef} max={1} aria-label="Replay-förlopp" />
            </div>
          ) : null}
          {isRecovering ? (
            <div className="p100-motion-recovery" role="status" aria-live="polite">
              <RefreshCw className="p100-spin" />
              <span>
                <strong>Posemotorn återansluter…</strong>
                Försök {workerRecoveryAttempt ?? 1} av {MOTION_WORKER_MAX_RESTARTS}. Bossfightens klocka är pausad.
              </span>
            </div>
          ) : null}
          {error ? <div className="p100-motion-error" role="alert"><VideoOff /><span><strong>Något stoppade motorn</strong>{error}</span></div> : null}
        </div>

        <aside className="p100-motion-sidebar">
          <section className="p100-motion-panel">
            <header><span>Input</span><strong>Kameraläge</strong></header>
            <label className="p100-motion-select">
              <span>Önskad upplösning</span>
              <select value={resolution} onChange={(event) => void changeResolution(event.target.value as Resolution)} disabled={isStarting || isRecovering || changingResolution || baselineRunning || performanceProfileRunning}>
                <option value="640x480">640 × 480 · baseline</option>
                <option value="1280x720">1280 × 720 · kvalitet</option>
              </select>
              <small>{changingResolution ? "Byter kameraläge…" : actualResolution ? `Kameran levererar ${actualResolution}` : "Aktiveras när kameran startar"}</small>
            </label>
            <label className="p100-motion-select">
              <span>Arena-röst & Announcer</span>
              <select
                value={arenaLanguage}
                onChange={(event) => changeArenaLanguage(event.target.value as MotionArenaLanguage)}
              >
                <option value="en">Engelska (Arcade Announcer · 0 ms)</option>
                <option value="sv">Svenska (Klassisk)</option>
              </select>
              <small>Lokal webbläsarsyntes utan API-kostnad.</small>
            </label>
            <label className="p100-motion-select">
              <span>Svårighetsgrad</span>
              <select
                value={difficulty}
                onChange={(event) => changeDifficulty(event.target.value as MotionGameDifficulty)}
              >
                <option value="easy">Lätt (Stora noder · längre tid)</option>
                <option value="medium">Medel (Klassisk balans · sparkar)</option>
                <option value="hard">Svår (Snabba noder · dubbelslag · sparkar)</option>
              </select>
              <small>
                {difficulty === "easy"
                  ? "För nybörjare eller mindre barn. Gott om tid på varje mål."
                  : difficulty === "medium"
                    ? "Balanserat tempo med sparkar när hela kroppen syns."
                    : "Maximal utmaning: kräver dubbelslag med båda händerna samtidigt!"}
              </small>
            </label>
            <div className="p100-motion-readiness">
              <span className={isLive ? "ok" : ""}><i /> Kamera</span>
              <span className={status === "running" ? "ok" : ""}><i /> Worker</span>
              <span className={poseVisible ? "ok" : ""}><i /> 33 landmarks</span>
              <span className={fullBodyVisible ? "ok" : ""}><i /> Hel kropp</span>
              <span className={lightOkay ? "ok" : luminance === null ? "" : "warn"}><i /> {luminance === null ? "Ljus väntar" : lightOkay ? "Ljus bra" : "Mer ljus"}</span>
            </div>
          </section>

          <section className="p100-motion-panel p100-motion-benchmark">
            <header><span>Live telemetry</span><strong>Pipeline</strong></header>
            <div className="p100-motion-metric-grid">
              <article><small>Capture</small><strong>{metrics.captureFps}</strong><span>FPS</span></article>
              <article><small>Pose</small><strong>{metrics.poseHz}</strong><span>Hz</span></article>
              <article><small>Render</small><strong>{metrics.renderFps}</strong><span>FPS</span></article>
              <article><small>Tappade</small><strong>{metrics.droppedFrames}</strong><span>frames</span></article>
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
                <button type="button" className="running" onClick={() => finishPerformanceProfile()}>
                  <CircleStop /> Stoppa · {performanceProfileCountdown > 0 ? `${performanceProfileCountdown} s till start` : remainingClock(performanceProfileDurationMs, performanceProfileElapsedMs)}
                </button>
              ) : (
                <div className="p100-motion-profiler-actions">
                  <button
                    type="button"
                    onClick={() => startPerformanceProfile("quick")}
                    disabled={!isLive || isRecovering || baselineRunning || replaying || gameActive}
                  >
                    <Gauge /> Snabbprofil · 30 s
                  </button>
                  <button
                    type="button"
                    onClick={() => startPerformanceProfile("gate-b")}
                    disabled={!isLive || isRecovering || baselineRunning || replaying || gameActive}
                  >
                    <Play /> Gate B · 10 min
                  </button>
                </div>
              )}
              {performanceProfileReport ? (
                <div className="p100-motion-profile-result">
                  <small>{performanceProfileReport.protocol === "gate-b-10m-v1" ? "Fryst Gate B-resultat" : "Fryst 30-sekundersresultat"}</small>
                  <strong>{performanceProfileReport.summary.poseHzAverage} Hz · {performanceProfileReport.summary.inferenceP95} ms p95</strong>
                  <span>Capture {performanceProfileReport.summary.captureFpsAverage} · Render {performanceProfileReport.summary.renderFpsAverage} FPS</span>
                  <span>Buffert {performanceProfileReport.summary.bufferWaitP95} ms · Bildprep {performanceProfileReport.summary.preparationP95} ms · Övrigt {performanceProfileReport.summary.overheadP95} ms p95</span>
                  <span>{Object.values(performanceProfileReport.checks).filter(Boolean).length}/6 kvalitetskontroller · {performanceProfileReport.counts.droppedFrames} tappade · {performanceProfileReport.counts.workerRestarts} worker-omstarter</span>
                  <div>
                    <button type="button" onClick={() => void copyPerformanceProfile()}>{performanceProfileCopied ? <Check /> : <Copy />} {performanceProfileCopied ? "Kopierad" : "Kopiera JSON"}</button>
                    <button type="button" onClick={downloadPerformanceProfile}><Download /> Ladda ned</button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="p100-motion-panel p100-motion-cold-starts">
            <header><span>Gate A</span><strong>Kallstarter</strong></header>
            <div><strong>{coldStarts.successes}/{coldStarts.attempts}</strong><span>Mål: minst 9 lyckade av 10 försök.</span></div>
            <button type="button" onClick={resetColdStarts}><RotateCcw /> Nollställ räknare</button>
            <button type="button" onClick={simulateWorkerFailure} disabled={status !== "running" || poseExecutionMode !== "worker"} title={poseExecutionMode === "main-thread" ? "Mobilmotorn kör avsiktligt utan Web Worker på iPhone" : "Pausar kort och provar den automatiska återhämtningen"}><RefreshCw /> {poseExecutionMode === "main-thread" ? "Mobil fallback aktiv" : "Testa worker-återstart"}</button>
          </section>
        </aside>
      </section>

      <section className="p100-motion-recording">
        <div className="p100-motion-recording-copy">
          <span><ShieldCheck /></span>
          <div><small>Privat testdata</small><strong>Landmark-logg, aldrig råvideo</strong><p>Spela in pose-snapshots och tidsstämplar för reproducerbar replay. Filen lämnar inte enheten om du inte själv flyttar den.</p></div>
        </div>
        <div className="p100-motion-recording-actions">
          {recording ? (
            <button type="button" className="recording" onClick={finishRecording}><CircleStop /> Stoppa · {recordedFrameCount} frames</button>
          ) : (
            <button type="button" onClick={beginRecording} disabled={!isLive || isRecovering || replaying || baselineRunning || performanceProfileRunning}><Square /> Spela in landmarks</button>
          )}
          <button type="button" onClick={replaying ? cancelReplay : replayRecording} disabled={!recordingData || recording || gameActive || baselineRunning || performanceProfileRunning}><Play /> {replaying ? "Stoppa replay" : "Replay"}</button>
          <button type="button" onClick={downloadRecording} disabled={!recordingData}><Download /> Ladda ned replay (.json)</button>
        </div>
        {recordingData && !recording ? <small className="p100-motion-recording-ready">Redo: {recordingData.frameCount} frames över {(recordingData.durationMs / 1000).toFixed(1)} sekunder.</small> : null}
      </section>

      <section className="p100-motion-baseline">
        <div className="p100-motion-baseline-head">
          <div>
            <small>Fas A · reproducerbar mätning</small>
            <strong>3 min baslinje</strong>
            <p>Rör dig som i spelet: stå neutralt, slå åt sidorna, gör knäböj och ducka. Endast mätvärden och synlighetsflaggor sparas.</p>
          </div>
          <div className="p100-motion-baseline-actions">
            <button type="button" className="voice" onClick={toggleVoiceGuidance} aria-pressed={voiceGuidance}>
              {voiceGuidance ? <Volume2 /> : <VolumeX />} Röstguide {voiceGuidance ? "på" : "av"}
            </button>
            {baselineRunning ? (
              <button type="button" className="running" onClick={() => finishBaseline()} title="Avslutar före tre minuter och skapar en delrapport"><CircleStop /> Avbryt · {baselineClock(baselineElapsedMs)}</button>
            ) : (
              <button type="button" onClick={startBaseline} disabled={!isLive || isRecovering || recording || replaying || gameActive || performanceProfileRunning}><Play /> Starta 3 min</button>
            )}
            <button type="button" className="report-download" onClick={downloadBaselineReport} disabled={!baselineReport}><Download /> Ladda ned rapport (.json)</button>
            <button type="button" onClick={() => void copyBaselineReport()} disabled={!baselineReport}>
              {reportCopied ? <Check /> : <Copy />} {reportCopied ? "Rapport kopierad" : "Kopiera rapport"}
            </button>
          </div>
        </div>

        <div className="p100-motion-baseline-progress" aria-label="Baslinjemätningens förlopp">
          <span style={{ width: `${baselineProgress}%` }} />
        </div>

        <div className="p100-motion-baseline-protocol">
          {MOTION_BASELINE_PROTOCOL.map((phase, index) => (
            <article key={phase.id} className={baselineRunning && phase.id === baselinePhase.id ? "active" : ""}>
              <small>{index + 1} · {phase.cameraView}</small>
              <strong>{phase.title}</strong>
              <span>{Math.round((phase.endsAtMs - phase.startsAtMs) / 1000)} sek</span>
            </article>
          ))}
          <p><strong>Vinkelguide:</strong> Framifrån visar höger–vänster-symmetri. Cirka 45° ger bättre djupinformation utan att benen överlappar. Golvarmhävningar analyseras bäst från sidan, men kräver en separat kameravinkel som ser händer till fötter och ingår därför inte i vardagsrumsbaslinjen.</p>
        </div>

        {baselineRunning ? (
          <div className="p100-motion-baseline-live" aria-live="polite">
            <span className={fullBodyVisible ? "ok" : "warn"}>{fullBodyVisible ? "Hel kropp synlig" : "Backa – kroppen lämnar bild"}</span>
            <span className={lightOkay ? "ok" : "warn"}>{lightOkay ? `Ljus ${rounded(luminance ?? 0)}` : "Mer ljus hjälper precisionen"}</span>
            <span>{baselineClock(baselineElapsedMs)} kvar</span>
          </div>
        ) : null}

        {baselineReport ? (
          <div className="p100-motion-baseline-report">
            <header>
              <div><small>Senaste rapport</small><strong>{baselinePassedChecks}/4 kvalitetskontroller</strong></div>
              <span>{baselineReport.actualResolution} · {baselineReport.delegate}</span>
            </header>
            <div className="p100-motion-baseline-metrics">
              <article><small>Capture snitt</small><strong>{baselineReport.summary.captureFpsAverage}</strong><span>FPS</span></article>
              <article><small>Pose snitt</small><strong>{baselineReport.summary.poseHzAverage}</strong><span>Hz</span></article>
              <article><small>Första render p95</small><strong>{milliseconds(baselineReport.summary.firstRenderP95)}</strong></article>
              <article><small>Hel kropp</small><strong>{baselineReport.summary.fullBodyVisiblePercent}%</strong></article>
            </div>
            <div className="p100-motion-baseline-checks">
              <span className={baselineReport.checks.captureNear30Fps ? "ok" : "warn"}><i /> Capture nära 30 FPS</span>
              <span className={baselineReport.checks.renderNear60Fps ? "ok" : "warn"}><i /> Render nära 60 FPS</span>
              <span className={baselineReport.checks.poseAtLeast20Hz ? "ok" : "warn"}><i /> Pose minst 20 Hz</span>
              <span className={baselineReport.checks.bodyVisibleAtLeast90Percent ? "ok" : "warn"}><i /> Hel kropp minst 90%</span>
            </div>
            <small className="p100-motion-baseline-note">{baselineReport.sampleCount} prover över {(baselineReport.durationMs / 1000).toFixed(1)} sekunder · pose guard: {baselineReport.summary.heldLowConfidencePercent}% hållna, {baselineReport.summary.limitedOutlierPercent}% begränsade · ingen råvideo · detta är filen att skicka för analys</small>
          </div>
        ) : null}
      </section>

      <footer className="p100-motion-footnote"><Gauge /> MediaPipe Pose Landmarker Lite körs i en separat Web Worker. Runtime och modell hämtas versionslåst vid första start; kamerabilder skickas inte till Zickaris-servern.</footer>
    </div>
  );
}
