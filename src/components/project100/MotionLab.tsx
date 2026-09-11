"use client";

import {
  Camera,
  Gauge,
  Play,
  RefreshCw,
  Smartphone,
  Swords,
  Video,
  VideoOff,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import {
  calculateEndToEndLatency,
  evaluateRemoteSensorNotice,
  MotionLatencyTracker,
  type MotionSensorFrame,
  type RemoteSensorNotice,
} from "@/lib/motion-remote";

import {
  motionArenaCue,
  motionArenaStartCue,
  type MotionArenaCue,
  type MotionArenaLanguage,
} from "@/lib/motion-announcer";
import {
  MOTION_BASELINE_PROTOCOL,
  MOTION_WORKER_MAX_RESTARTS,
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
  pauseMotionGameFor,
  startMotionGame,
  type MotionGameDifficulty,
  type MotionGameEffect,
  type MotionGameState,
} from "@/lib/motion-game";
import {
  advanceSquatTracker,
  buildSquatTestReport,
  createSquatTrackerState,
  measureSquatAngles,
  squatVoiceCue,
  type SquatCueSound,
  type SquatTrackerState,
} from "@/lib/motion-squat";
import {
  advanceWorkoutSession,
  applyNextSetAdjustment,
  buildWorkoutSessionReport,
  calculateNextSetTarget,
  createWorkoutCoachDisciplineState,
  createWorkoutSession,
  getRestDurationForSet,
  getRestSecondsRemaining,
  getWorkoutRepSpeechCue,
  recordSetRpe,
  skipWorkoutRest,
  startWorkoutSession,
  type WorkoutCoachDisciplineState,
  type WorkoutSessionReport,
  type WorkoutSessionState,
} from "@/lib/motion-workout";
import {
  createDefaultCoachMemory,
  DEFAULT_COACH_SETTINGS,
  formatCoachRepCue,
  formatCoachSetCompleteCue,
  updateCoachMemoryWithSession,
  validateCoachSafetyPrompt,
  type CoachSettings,
  type MotionCoachMemory,
} from "@/lib/motion-coach";
import { MotionLandmarkStabilizer } from "@/lib/motion-stabilizer";

import {
  angleDegrees,
  baselineClock,
  milliseconds,
  remainingClock,
  rounded,
} from "./motion/motion-formatting";
import {
  GATE_B_COUNTDOWN_MS,
  GATE_B_DURATION_MS,
  GATE_B_PHASES,
  GateBPhase,
  gateBPhase,
} from "./motion/motion-gate-b";
import { drawSnapshot, drawMotionGame } from "./motion/MotionCanvasRenderer";
import {
  ensureAudioContext,
  playGameSound as playSynthGameSound,
  playSquatSound as playSynthSquatSound,
} from "./motion/MotionSoundPlayer";
import { MotionStageTopBar } from "./motion/MotionStageTopBar";
import { MotionCameraControls, type Resolution } from "./motion/MotionCameraControls";
import { MotionWorkoutOverlay } from "./motion/MotionWorkoutOverlay";
import { MotionWorkoutPanel, type RestPreset } from "./motion/MotionWorkoutPanel";
import { MotionArenaOverlay } from "./motion/MotionArenaOverlay";
import { CyclingIntervalOverlay } from "./motion/CyclingIntervalOverlay";
import {
  createCyclingIntervalSession,
  advanceCyclingIntervalSession,
  skipToNextCyclingInterval,
  type CyclingIntervalSessionState,
} from "@/lib/motion-cycling-intervals";
import type { CyclingTrackerState } from "@/lib/motion-cycling";
import { CyclingTestBench } from "./motion/CyclingTestBench";
import { LungeTestBench } from "./motion/LungeTestBench";
import { OverheadPressTestBench } from "./motion/OverheadPressTestBench";
import { buildPushupTestReport } from "@/lib/motion-pushup-test";
import { buildLungeTestReport } from "@/lib/motion-lunge-test";
import { buildOverheadPressTestReport } from "@/lib/motion-overhead-press-test";
import type { PushupTrackerState, LungeTrackerState } from "@/lib/motion-exercises";
import type { OverheadPressTrackerState } from "@/lib/motion-library";
import { MotionDiagnosticsOverlay, type BaselineNoticeState } from "./motion/MotionDiagnosticsOverlay";
import {
  MotionDiagnosticsPanel,
  type EngineStatus,
  type MotionMetrics,
  type PerformanceProfileMode,
  type PoseExecutionMode,
} from "./motion/MotionDiagnosticsPanel";
import {
  getExerciseCameraGuidance,
  getExerciseProfile,
  type ExerciseType,
} from "@/lib/motion-exercises";
import {
  EXERCISE_LIBRARY,
  getLibraryCameraGuidance,
  createUnifiedExerciseTracker,
  advanceUnifiedExerciseTracker,
  type TrackableExerciseId,
  type UnifiedExerciseState,
} from "@/lib/motion-library";
import {
  WORKOUT_PROGRAMS,
  getWorkoutProgram,
  createProgramSession,
  completeProgramSet,
  tickProgramRest,
  skipProgramRest,
  generateProgramSummary,
  saveProgramSessionSnapshot,
  loadProgramSessionSnapshot,
  clearProgramSessionSnapshot,
  type ProgramId,
  type ProgramSessionState,
  type ProgramSummary,
} from "@/lib/motion-programs";
import type { WorkoutPanelSelection } from "./motion/MotionWorkoutPanel";
import { duckAudioGainNode } from "@/lib/motion-sound";
import {
  evaluateExerciseFraming,
  type ExerciseFramingFeedback,
} from "@/lib/motion-camera-coach";
import type { MotionMissionLaunch } from "@/lib/motion-mission-launch";
import { MotionMissionSyncPanel } from "./motion/MotionMissionSyncPanel";
import { markCyclingWarmupComplete } from "@/lib/project100-warmup-memory";
import { AdaptiveCameraSetupPanel } from "./motion/AdaptiveCameraSetupPanel";
import type { SavedCameraSetupProfile } from "@/lib/motion-adaptive-camera";
import {
  syncProgramToWorkoutMemory,
  syncSquatToWorkoutMemory,
  convertProgramSessionToApiPayload,
  convertSquatSessionToApiPayload,
} from "@/lib/project100-motion-bridge";
import {
  clearWorkoutMemorySnapshot,
  loadWorkoutMemorySnapshot,
  saveWorkoutMemorySnapshot,
  type WorkoutMemorySet,
  type WorkoutMemorySnapshot,
} from "@/lib/project100-workout-memory";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const COLD_START_STORAGE_KEY = "projekt100.motion-lab.cold-starts.v1";
const MAX_RECORDED_FRAMES = 18_000;
const BASELINE_DURATION_MS = 180_000;
const QUICK_PROFILE_DURATION_MS = 30_000;
const DARK_LUMINANCE_THRESHOLD = 45;

function needsMainThreadPose(): boolean {
  const navigatorWithPlatform = navigator as Navigator & { platform?: string };
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigatorWithPlatform.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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

function matchExerciseNameToTracker(name: string): TrackableExerciseId | null {
  const lower = name.toLowerCase();
  if (lower.includes("knäböj") || lower.includes("squat")) return "squat";
  if (lower.includes("armhävning") || lower.includes("push-up") || lower.includes("pushup")) return "pushup";
  if (lower.includes("planka") || lower.includes("plank")) return "plank";
  if (lower.includes("utfall") || lower.includes("lunge")) return "lunge";
  if (lower.includes("handstående") || lower.includes("handstand")) return "handstand-hold";
  if (lower.includes("upphopp") || lower.includes("jumping")) return "jumping-jacks";
  if (lower.includes("rodd") || lower.includes("row")) return "bent-over-row";
  if (lower.includes("dips")) return "bench-dips";
  if (lower.includes("curl")) return "bicep-curl";
  if (lower.includes("press")) return "overhead-press";
  return null;
}

export function MotionLab({
  initialMissionLaunch = null,
  initialProgram,
  initialExercise,
  initialSource,
  initialAutoStartCamera = false,
  initialWarmupMissionId,
  initialPairingCode,
}: {
  initialMissionLaunch?: MotionMissionLaunch | null;
  initialProgram?: string;
  initialExercise?: string;
  initialSource?: string;
  initialAutoStartCamera?: boolean;
  initialWarmupMissionId?: string;
  initialPairingCode: string;
}) {
  const router = useRouter();
  const createConfiguredWorkoutSession = () => createWorkoutSession(
    initialMissionLaunch?.exerciseId === "squat"
      ? { targetSets: 1, targetRepsPerSet: initialMissionLaunch.targetReps }
      : undefined,
  );
  const configuredSquatCue = initialMissionLaunch?.exerciseId === "squat"
    ? `Dagens uppdrag: 1 set med ${initialMissionLaunch.targetReps} reps. Setet sparas först när du bekräftar det.`
    : "Pass 3×10 Knäböj: 3 set med 10 reps och vila. Allt loggas automatiskt.";
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
  const audioDuckingGainRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const replayFrameRef = useRef<number | null>(null);
  const reportCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const squatReportCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const squatTrackingEnabledRef = useRef(false);
  const squatTrackerRef = useRef(createSquatTrackerState());
  const squatProtocolRef = useRef<"workout-step-31" | "symmetry-step-26" | "tempo-step-25" | "rom-step-24">("workout-step-31");
  const workoutSessionRef = useRef<WorkoutSessionState>(createConfiguredWorkoutSession());
  const coachDisciplineRef = useRef<WorkoutCoachDisciplineState>(createWorkoutCoachDisciplineState());
  const lastSquatUiAtRef = useRef(0);
  const lastSquatCoachAtRef = useRef(0);
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
  const cyclingAutoStartedRef = useRef(false);
  const cameraAutoStartAttemptedRef = useRef(false);
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
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
  const [squatTrackingEnabled, setSquatTrackingEnabled] = useState(false);
  const [squatProtocol, setSquatProtocol] = useState<"workout-step-31" | "symmetry-step-26" | "tempo-step-25" | "rom-step-24">("workout-step-31");
  const [workoutSession, setWorkoutSession] = useState<WorkoutSessionState>(() => createConfiguredWorkoutSession());
  const [workoutReportCopied, setWorkoutReportCopied] = useState(false);
  type RestPreset = "30" | "45" | "60" | "dynamic";
  const [restPreset, setRestPreset] = useState<RestPreset>("45");
  const [activeWorkoutSnapshot, setActiveWorkoutSnapshot] = useState<WorkoutMemorySnapshot | null>(() => {
    if (typeof window !== "undefined") {
      const isSourceActive =
        initialSource === "active" ||
        new URLSearchParams(window.location.search).get("source") === "active";
      if (isSourceActive) {
        return loadWorkoutMemorySnapshot();
      }
    }
    return null;
  });

  const nextPendingExercise = useMemo(() => {
    if (!activeWorkoutSnapshot) return null;
    return (
      activeWorkoutSnapshot.exercises.find((ex) => ex.sets.some((s: WorkoutMemorySet) => !s.done)) ??
      activeWorkoutSnapshot.exercises[0] ??
      null
    );
  }, [activeWorkoutSnapshot]);

  const nextPendingSet = useMemo(() => {
    if (!nextPendingExercise) return null;
    return nextPendingExercise.sets.find((s: WorkoutMemorySet) => !s.done) ?? null;
  }, [nextPendingExercise]);

  const matchedCameraExercise = useMemo(() => {
    if (!nextPendingExercise) return null;
    return matchExerciseNameToTracker(nextPendingExercise.name);
  }, [nextPendingExercise]);

  const [activeWorkoutExercise, setActiveWorkoutExercise] = useState<WorkoutPanelSelection>(() => {
    if (typeof window !== "undefined" && (initialSource === "active" || new URLSearchParams(window.location.search).get("source") === "active")) {
      const snap = loadWorkoutMemorySnapshot();
      if (snap && snap.exercises.length > 0) {
        const firstUndone = snap.exercises.find((ex) => ex.sets.some((s: WorkoutMemorySet) => !s.done)) ?? snap.exercises[0];
        const matched = matchExerciseNameToTracker(firstUndone.name);
        if (matched) return matched;
      }
    }
    if (initialExercise === "cycling-intervals-30" || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("exercise") === "cycling-intervals-30")) {
      return "cycling-intervals-30";
    }
    if (initialMissionLaunch?.exerciseId) return initialMissionLaunch.exerciseId;
    if (initialProgram && initialProgram in WORKOUT_PROGRAMS) return initialProgram as ProgramId;
    if (initialExercise && initialExercise in EXERCISE_LIBRARY) return initialExercise as TrackableExerciseId;
    return "squat";
  });

  const [unifiedTracker, setUnifiedTracker] = useState<UnifiedExerciseState>(() => {
    const targetEx =
      activeWorkoutExercise === "cycling-intervals-30"
        ? "cycling"
        : (activeWorkoutExercise in EXERCISE_LIBRARY || activeWorkoutExercise === "squat")
        ? (activeWorkoutExercise as TrackableExerciseId)
        : initialMissionLaunch?.exerciseId ??
          (initialProgram && initialProgram in WORKOUT_PROGRAMS
            ? WORKOUT_PROGRAMS[initialProgram as ProgramId].exercises[0].exerciseId
            : initialExercise === "cycling-intervals-30"
            ? "cycling"
            : initialExercise && initialExercise in EXERCISE_LIBRARY
            ? (initialExercise as TrackableExerciseId)
            : "squat");
    return createUnifiedExerciseTracker(targetEx);
  });
  const unifiedTrackerRef = useRef<UnifiedExerciseState>(unifiedTracker);
  const [programSession, setProgramSession] = useState<ProgramSessionState | null>(null);
  const programSessionRef = useRef<ProgramSessionState | null>(null);
  const [programSummary, setProgramSummary] = useState<ProgramSummary | null>(null);
  const [savedProgramSnapshot, setSavedProgramSnapshot] = useState<ProgramSessionState | null>(null);
  const [isSavingToLog, setIsSavingToLog] = useState(false);
  const [isSavedToLog, setIsSavedToLog] = useState(false);
  const [saveLogError, setSaveLogError] = useState<string | null>(null);

  const [cyclingIntervalSession, setCyclingIntervalSession] = useState<CyclingIntervalSessionState | null>(() => {
    const isIntervalInit =
      initialExercise === "cycling-intervals-30" ||
      (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("exercise") === "cycling-intervals-30");
    return isIntervalInit ? createCyclingIntervalSession() : null;
  });
  const cyclingIntervalSessionRef = useRef<CyclingIntervalSessionState | null>(cyclingIntervalSession);
  cyclingIntervalSessionRef.current = cyclingIntervalSession;
  const [cyclingVoiceEnabled, setCyclingVoiceEnabled] = useState(true);
  const lastCyclingStepIdRef = useRef<string | null>(cyclingIntervalSession?.currentStep.id ?? null);

  useEffect(() => {
    if (activeWorkoutSnapshot && nextPendingExercise && matchedCameraExercise) {
      setActiveWorkoutExercise(matchedCameraExercise);
      const tracker = createUnifiedExerciseTracker(matchedCameraExercise);
      unifiedTrackerRef.current = tracker;
      setUnifiedTracker(tracker);
      setSquatTrackingEnabled(true);
      squatTrackingEnabledRef.current = true;
    }
  }, [activeWorkoutSnapshot, nextPendingExercise, matchedCameraExercise]);

  function syncCompletedSetToActiveSnapshot(exerciseName: string, repsAchieved: number, holdSec?: number) {
    setActiveWorkoutSnapshot((currentSnapshot) => {
      if (!currentSnapshot) return null;
      const updatedExercises = currentSnapshot.exercises.map((ex) => {
        const matches =
          ex.name.toLowerCase().includes(exerciseName.toLowerCase()) ||
          exerciseName.toLowerCase().includes(ex.name.toLowerCase());
        if (matches) {
          const firstUndoneIdx = ex.sets.findIndex((s) => !s.done);
          if (firstUndoneIdx !== -1) {
            return {
              ...ex,
              sets: ex.sets.map((s, idx) =>
                idx === firstUndoneIdx
                  ? {
                      ...s,
                      done: true,
                      actualReps: String(repsAchieved),
                      actualDurationSeconds: holdSec ? String(holdSec) : s.durationSeconds,
                    }
                  : s,
              ),
            };
          }
        }
        return ex;
      });

      const nextSnap: WorkoutMemorySnapshot = {
        ...currentSnapshot,
        updatedAtMs: Date.now(),
        exercises: updatedExercises,
      };
      saveWorkoutMemorySnapshot(nextSnap);
      return nextSnap;
    });
  }

  async function handleSaveSessionToLog() {
    setIsSavingToLog(true);
    setSaveLogError(null);
    try {
      let payload: any = null;
      if (activeWorkoutSnapshot && activeWorkoutSnapshot.exercises.some((e) => e.sets.some((s) => s.done))) {
        const completedExercises = activeWorkoutSnapshot.exercises
          .map((ex) => {
            const doneSets = ex.sets.filter((s) => s.done);
            if (doneSets.length === 0) return null;
            return {
              name: ex.name.trim(),
              notes: ex.notes?.trim() || null,
              sets: doneSets.map((s) => ({
                reps: s.actualReps ? Number(s.actualReps) : s.reps ? Number(s.reps) : null,
                weightKg: s.actualWeightKg ? Number(s.actualWeightKg) : s.weightKg ? Number(s.weightKg) : null,
                durationSeconds: s.actualDurationSeconds
                  ? Number(s.actualDurationSeconds)
                  : s.durationSeconds
                  ? Number(s.durationSeconds)
                  : null,
                distanceMeters: null,
                rpe: s.actualRpe ? Number(s.actualRpe) : s.rpe ? Number(s.rpe) : null,
              })),
            };
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);

        const elapsedSec = Math.max(
          60,
          Math.round((Date.now() - activeWorkoutSnapshot.startedAtMs) / 1000),
        );
        payload = {
          title: activeWorkoutSnapshot.title,
          activityType: activeWorkoutSnapshot.activityType,
          status: "completed" as const,
          sessionDate: activeWorkoutSnapshot.sessionDate,
          templateId: activeWorkoutSnapshot.templateId ?? null,
          plannedStartAt: null,
          plannedEndAt: null,
          durationSeconds: elapsedSec,
          location: activeWorkoutSnapshot.location.trim() || null,
          effort: activeWorkoutSnapshot.effort ? parseInt(activeWorkoutSnapshot.effort, 10) : null,
          bodyBefore: null,
          bodyAfter: null,
          notes: activeWorkoutSnapshot.notes.trim() || null,
          exercises: completedExercises,
        };
      } else if (programSessionRef.current && programSessionRef.current.completedSets.length > 0) {
        payload = convertProgramSessionToApiPayload(programSessionRef.current);
      } else if (workoutSessionRef.current && workoutSessionRef.current.completedSets.length > 0) {
        payload = convertSquatSessionToApiPayload(workoutSessionRef.current);
      } else if (cyclingIntervalSessionRef.current && cyclingIntervalSessionRef.current.elapsedSeconds > 10) {
        const sess = cyclingIntervalSessionRef.current;
        const totalSec = Math.max(60, Math.round(sess.elapsedSeconds));
        const estimatedCalories = Math.round(sess.elapsedSeconds * (450 / 1800));
        const revs = unifiedTrackerRef.current?.reps ?? 0;

        const dateStr = new Date().toISOString().slice(0, 10);
        payload = {
          title: "30 min Intervallcykling",
          activityType: "spinning",
          status: "completed" as const,
          sessionDate: dateStr,
          templateId: null,
          plannedStartAt: null,
          plannedEndAt: null,
          durationSeconds: totalSec,
          location: "Hemma",
          effort: 8,
          bodyBefore: null,
          bodyAfter: null,
          notes: `Genomfört intervallpass på motionscykel: ${Math.round(sess.elapsedSeconds / 60)} min. Uppskattad förbränning: ~${estimatedCalories} kcal.${revs > 0 ? ` Trampvarv: ${revs}.` : ""}`,
          exercises: [
            {
              name: "Motionscykel Intervaller",
              notes: `30 min intervallpass med motståndsvariationer (Lätt, Medel, Tungt/Trögt). Genomförda intervallblock: ${sess.currentStepIndex + 1}/${sess.plan.steps.length}.${revs > 0 ? ` Trampvarv: ${revs}.` : ""}`,
              sets: [
                {
                  reps: revs > 0 ? revs : null,
                  weightKg: null,
                  durationSeconds: totalSec,
                  distanceMeters: null,
                  rpe: 8,
                },
              ],
            },
          ],
        };
      }

      if (!payload || payload.exercises.length === 0) {
        setSaveLogError("Inga genomförda set att spara än.");
        setIsSavingToLog(false);
        return;
      }

      const response = await fetch("/api/project100/training/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message ?? "Kunde inte spara passet till databasen.");
      }

      setIsSavedToLog(true);
      clearProgramSessionSnapshot();
      clearWorkoutMemorySnapshot();
      setActiveWorkoutSnapshot(null);
      setSavedProgramSnapshot(null);
      if (initialWarmupMissionId) {
        markCyclingWarmupComplete(initialWarmupMissionId);
      }
      speakSquatInstruction("Bra kört! Passet har sparats i din träningslogg.", true);
    } catch (err) {
      setSaveLogError(err instanceof Error ? err.message : "Något gick fel vid sparandet.");
    } finally {
      setIsSavingToLog(false);
    }
  }

  useEffect(() => {
    const saved = loadProgramSessionSnapshot();
    setSavedProgramSnapshot(saved);
    if (!saved && initialProgram && initialProgram in WORKOUT_PROGRAMS) {
      const prog = WORKOUT_PROGRAMS[initialProgram as ProgramId];
      if (prog) {
        const sess = createProgramSession(prog);
        programSessionRef.current = sess;
        setProgramSession(sess);
        const firstExId = sess.activeExercise.exerciseId;
        const initialTracker = createUnifiedExerciseTracker(firstExId);
        unifiedTrackerRef.current = initialTracker;
        setUnifiedTracker(initialTracker);
      }
    }
  }, [initialProgram]);

  function handleResumeProgramSession(saved: ProgramSessionState) {
    programSessionRef.current = saved;
    setProgramSession(saved);
    setSavedProgramSnapshot(saved);
    setActiveWorkoutExercise(saved.programId);
    const tracker = createUnifiedExerciseTracker(saved.activeExercise.exerciseId);
    unifiedTrackerRef.current = tracker;
    setUnifiedTracker(tracker);
    lastUnifiedRepRef.current = 0;
    lastUnifiedHoldRef.current = 0;
    setSquatTrackingEnabled(true);
    squatTrackingEnabledRef.current = true;
    const prog = WORKOUT_PROGRAMS[saved.programId];
    const exName =
      EXERCISE_LIBRARY[saved.activeExercise.exerciseId]?.name ?? saved.activeExercise.exerciseId;
    speakSquatInstruction(
      `Återupptar ${prog?.title ?? "program"}. Fortsätter med ${exName}, set ${saved.currentSet} av ${saved.activeExercise.sets}. Gör dig redo!`,
      true,
    );
  }

  function handleDiscardProgramSession() {
    clearProgramSessionSnapshot();
    setSavedProgramSnapshot(null);
  }

  const lastUnifiedRepRef = useRef<number>(0);
  const lastUnifiedHoldRef = useRef<number>(0);
  const [framingFeedback, setFramingFeedback] = useState<ExerciseFramingFeedback | null>(null);
  const [cameraSetupProfile, setCameraSetupProfile] = useState<SavedCameraSetupProfile | null>(null);
  const lastSpokenFramingRef = useRef<string | null>(null);
  const lastSpokenFramingTimeRef = useRef<number>(0);

  const activeExerciseTitle = (() => {
    if (programSession) {
      const prog = WORKOUT_PROGRAMS[programSession.programId];
      const exItem = EXERCISE_LIBRARY[programSession.activeExercise.exerciseId];
      return `${prog?.title ?? "Program"} · ${exItem?.name ?? programSession.activeExercise.exerciseId}`;
    }
    if (activeWorkoutExercise === "cycling-intervals-30") return "30 min Intervallcykling";
    const libEx = EXERCISE_LIBRARY[activeWorkoutExercise as TrackableExerciseId];
    if (libEx) return libEx.name;
    const prog = WORKOUT_PROGRAMS[activeWorkoutExercise as ProgramId];
    if (prog) return prog.title;
    return "Knäböj";
  })();
  const [squatView, setSquatView] = useState<SquatTrackerState>(() => createSquatTrackerState());
  const [squatCoachCue, setSquatCoachCue] = useState<string>(configuredSquatCue);
  const [squatReportCopied, setSquatReportCopied] = useState(false);
  const [coachSettings, setCoachSettings] = useState<CoachSettings>(DEFAULT_COACH_SETTINGS);
  const coachSettingsRef = useRef<CoachSettings>(coachSettings);

  function changeCoachSettings(next: CoachSettings) {
    coachSettingsRef.current = next;
    setCoachSettings(next);
    try {
      localStorage.setItem("p100_motion_coach_settings", JSON.stringify(next));
    } catch {
      // safe
    }
  }

  const [coachMemory, setCoachMemory] = useState<MotionCoachMemory>(() => createDefaultCoachMemory());
  const coachMemoryRef = useRef<MotionCoachMemory>(coachMemory);
  const [newPrNotice, setNewPrNotice] = useState<string | null>(null);

  // Fas F: iPhone Wireless Sensor State & Diagnostics
  const [inputSource, setInputSource] = useState<"webcam" | "remote-sensor">("webcam");
  const remotePairingCode = initialPairingCode;
  const [remoteConnected, setRemoteConnected] = useState<boolean>(false);
  const [remoteFps, setRemoteFps] = useState<number>(0);
  const [remoteBattery, setRemoteBattery] = useState<number | null>(null);
  const [remoteLatencyMs, setRemoteLatencyMs] = useState<number | undefined>(undefined);
  const [remoteNotice, setRemoteNotice] = useState<RemoteSensorNotice | null>(null);

  const remoteLatencyTrackerRef = useRef(new MotionLatencyTracker(100));
  const lastRemoteFrameIndexRef = useRef<number | null>(null);
  const lastRemoteFrameAtRef = useRef<number | null>(null);
  const remotePollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteHostTokenRef = useRef<string | null>(null);

  function changeInputSource(source: "webcam" | "remote-sensor") {
    setInputSource(source);
    try {
      localStorage.setItem("p100_motion_input_source", source);
    } catch {}
  }

  useEffect(() => {
    if (inputSource !== "remote-sensor") {
      if (remotePollTimerRef.current) {
        clearInterval(remotePollTimerRef.current);
        remotePollTimerRef.current = null;
      }
      return;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    cameraInfoRef.current.delegate = "GPU";
    setDelegate("GPU");
    activeRef.current = true;
    engineReadyRef.current = true;
    setStatus("running");

    const canvas = canvasRef.current;
    if (canvas && (!canvas.width || !canvas.height)) {
      const [defW, defH] = resolution.split("x").map(Number);
      canvas.width = defW || 640;
      canvas.height = defH || 480;
    }

    startRenderLoop();

    void fetch("/api/motion/sensor/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", pairingCode: remotePairingCode }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.hostToken === "string") {
          remoteHostTokenRef.current = data.hostToken;
        }
      })
      .catch(() => {});

    remotePollTimerRef.current = setInterval(async () => {
      try {
        const hostToken = remoteHostTokenRef.current;
        if (!hostToken) return;

        const res = await fetch(
          `/api/motion/sensor/relay?session=${remotePairingCode}&role=host&token=${encodeURIComponent(hostToken)}`,
        );
        if (!res.ok) {
          setRemoteConnected(false);
          return;
        }
        const data = (await res.json()) as {
          connected: boolean;
          latestFrame: MotionSensorFrame | null;
          signals?: Array<{ type: string; payload?: unknown }>;
          serverTimeMs: number;
        };

        // Steg 67: Handle remote signals/commands from phone
        if (data.signals && Array.isArray(data.signals)) {
          for (const sig of data.signals) {
            if (sig.type === "command" && sig.payload) {
              const cmd = sig.payload as { action: string };
              if (cmd.action === "skip-rest") {
                handleSkipRest();
              }
            }
          }
        }

        const now = performance.now();
        const latestFrame = data.latestFrame;

        if (latestFrame && latestFrame.frameIndex !== lastRemoteFrameIndexRef.current) {
          lastRemoteFrameIndexRef.current = latestFrame.frameIndex;
          lastRemoteFrameAtRef.current = now;

          const transitMs = calculateEndToEndLatency(latestFrame, Date.now(), 0);
          const pipelineStart = performance.now();

          if (latestFrame.landmarks && latestFrame.landmarks.length === 33) {
            const snapshot: MotionPoseSnapshot = {
              capturedAtMs: latestFrame.clientTimestampMs,
              bufferWaitMs: 0,
              inferenceMs: 0,
              preparationMs: 0,
              landmarks: latestFrame.landmarks.map((l) => ({ ...l })),
              stabilization: { heldLowConfidence: 0, limitedOutliers: 0 },
              timestampMs: latestFrame.clientTimestampMs,
            };
            acceptPoseSnapshot(snapshot);
          }

          const pipelineMs = performance.now() - pipelineStart;
          remoteLatencyTrackerRef.current.record(transitMs, pipelineMs, latestFrame.frameIndex);

          setRemoteConnected(true);
          setRemoteFps(latestFrame.fps);
          if (latestFrame.batteryLevel !== undefined) {
            setRemoteBattery(latestFrame.batteryLevel);
          }
          setRemoteLatencyMs(transitMs);
        }

        const notice = evaluateRemoteSensorNotice({
          connected: data.connected,
          lastFrameReceivedAtMs: lastRemoteFrameAtRef.current,
          nowMs: now,
          batteryLevel: latestFrame?.batteryLevel,
          fullBodyVisible: fullBodyVisibleRef.current,
          fps: latestFrame?.fps,
          latencyMs: remoteLatencyMs,
        });
        setRemoteNotice(notice);
      } catch {
        setRemoteConnected(false);
      }
    }, 33);

    return () => {
      if (remotePollTimerRef.current) {
        clearInterval(remotePollTimerRef.current);
        remotePollTimerRef.current = null;
      }
    };
  }, [inputSource, remotePairingCode]);

  function changeRestPreset(preset: RestPreset) {
    setRestPreset(preset);
    const restDurationSeconds = preset === "30" ? 30 : preset === "45" ? 45 : preset === "60" ? 60 : [30, 45, 60];
    workoutSessionRef.current = {
      ...workoutSessionRef.current,
      config: {
        ...workoutSessionRef.current.config,
        restDurationSeconds,
      },
    };
    setWorkoutSession({ ...workoutSessionRef.current });
  }

  function changeSquatProtocol(nextProtocol: "workout-step-31" | "symmetry-step-26" | "tempo-step-25" | "rom-step-24") {
    squatProtocolRef.current = nextProtocol;
    setSquatProtocol(nextProtocol);
    resetSquatTracking();
    if (nextProtocol === "workout-step-31") {
      const restDurationSeconds = restPreset === "30" ? 30 : restPreset === "45" ? 45 : restPreset === "60" ? 60 : [30, 45, 60];
      workoutSessionRef.current = createConfiguredWorkoutSession();
      workoutSessionRef.current = {
        ...workoutSessionRef.current,
        config: { ...workoutSessionRef.current.config, restDurationSeconds },
      };
      setWorkoutSession(workoutSessionRef.current);
      setSquatCoachCue(configuredSquatCue);
    } else if (nextProtocol === "symmetry-step-26") {
      setSquatCoachCue("Steg 26: Gör rep 1 med jämn balans, rep 2 med lätt förskjutning åt ena hållet, rep 3 mot andra sidan.");
    } else if (nextProtocol === "tempo-step-25") {
      setSquatCoachCue("Steg 25: Gör 1 vanlig rep, 1 långsam kontrollerad (3s ned), och 1 pausknäböj (2s botten).");
    } else {
      setSquatCoachCue("10 mot stolen (halva), därefter 10 djupa utan stol (fulla).");
    }
  }

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
      squatTrackingEnabledRef.current = false;
      squatTrackerRef.current = createSquatTrackerState();
      setSquatTrackingEnabled(false);
      setSquatView(squatTrackerRef.current);
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
        const storedCoachSettings = localStorage.getItem("p100_motion_coach_settings");
        if (storedCoachSettings) {
          const nextCoachSettings = {
            ...DEFAULT_COACH_SETTINGS,
            ...JSON.parse(storedCoachSettings),
          } as CoachSettings;
          coachSettingsRef.current = nextCoachSettings;
          setCoachSettings(nextCoachSettings);
        }
        const storedCoachMemory = localStorage.getItem("p100_motion_coach_memory");
        if (storedCoachMemory) {
          const nextCoachMemory = {
            ...createDefaultCoachMemory(),
            ...JSON.parse(storedCoachMemory),
          } as MotionCoachMemory;
          coachMemoryRef.current = nextCoachMemory;
          setCoachMemory(nextCoachMemory);
        }
        const storedInputSource = localStorage.getItem("p100_motion_input_source");
        if (storedInputSource === "webcam" || storedInputSource === "remote-sensor") {
          setInputSource(storedInputSource);
        }
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
      if (squatReportCopiedTimerRef.current !== null) clearTimeout(squatReportCopiedTimerRef.current);
      if (workerRestartTimerRef.current !== null) clearTimeout(workerRestartTimerRef.current);
      workerGenerationRef.current += 1;
      workerRef.current?.terminate();
      mainThreadPoseRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (workoutSession.status !== "resting" || workoutSession.restStartedAtMs === null) return;
    const interval = setInterval(() => {
      const now = performance.now();
      const res = advanceWorkoutSession(workoutSessionRef.current, squatTrackerRef.current, now);
      if (res.session !== workoutSessionRef.current) {
        workoutSessionRef.current = res.session;
        setWorkoutSession(res.session);
        if (res.cue) {
          if (res.cue.sound === "workout-complete") {
            playGameSound(null, true);
          } else if (res.cue.sound === "rest-end") {
            playSquatSound("rep");
          } else if (res.cue.sound === "rest-warning") {
            playSquatSound("half-depth");
          }
          speakSquatInstruction(res.cue.text, res.cue.priority);
          setSquatCoachCue(res.cue.text);
        }
        if (res.shouldResetSquatTracker) resetSquatTracking();
      } else {
        setWorkoutSession({ ...workoutSessionRef.current });
      }
    }, 250);
    return () => clearInterval(interval);
  }, [workoutSession.status, workoutSession.restStartedAtMs]);

  useEffect(() => {
    if (!programSession || programSession.phase !== "resting") return;
    const interval = setInterval(() => {
      const current = programSessionRef.current;
      if (!current || current.phase !== "resting") return;
      const next = tickProgramRest(current, 0.25);
      programSessionRef.current = next;
      setProgramSession(next);

      if (Math.ceil(next.restSecondsRemaining) === 5) {
        playSquatSound("half-depth");
        speakSquatInstruction("Fem sekunder kvar. Gör dig redo!", false);
      }

      if (next.phase === "active-set" && current.phase === "resting") {
        saveProgramSessionSnapshot(next);
        setSavedProgramSnapshot(next);
        playSquatSound("rep");
        const nextExId = next.activeExercise.exerciseId;
        const exName = EXERCISE_LIBRARY[nextExId]?.name ?? nextExId;
        speakSquatInstruction(
          `Vilan är slut! Starta Set ${next.currentSet} av ${next.activeExercise.sets} för ${exName}.`,
          true,
        );
        const tracker = createUnifiedExerciseTracker(nextExId);
        unifiedTrackerRef.current = tracker;
        setUnifiedTracker(tracker);
        lastUnifiedRepRef.current = 0;
        lastUnifiedHoldRef.current = 0;
      }
    }, 250);
    return () => clearInterval(interval);
  }, [programSession?.phase]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "Space" || event.key === " ") {
        if (
          squatTrackingEnabledRef.current &&
          ((squatProtocolRef.current === "workout-step-31" &&
            workoutSessionRef.current.status === "resting") ||
            (programSessionRef.current && programSessionRef.current.phase === "resting"))
        ) {
          event.preventDefault();
          handleSkipRest();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function playGameSound(effect: MotionGameEffect | null, finished = false) {
    playSynthGameSound(audioContextRef.current, effect, finished);
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

  function duckActiveAudio(durationSeconds = 2.2) {
    if (!audioContextRef.current) return;
    if (!audioDuckingGainRef.current) {
      try {
        const gain = audioContextRef.current.createGain();
        gain.gain.setValueAtTime(1.0, audioContextRef.current.currentTime);
        gain.connect(audioContextRef.current.destination);
        audioDuckingGainRef.current = gain;
      } catch {
        return;
      }
    }
    duckAudioGainNode(audioDuckingGainRef.current, {
      nowSeconds: audioContextRef.current.currentTime,
      durationSeconds,
      duckLevel: 0.25,
    });
  }

  function speakBaselineInstruction(text: string) {
    if (!voiceGuidanceRef.current || !("speechSynthesis" in window)) return;
    duckActiveAudio(2.5);
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

  function playSquatSound(sound?: SquatCueSound) {
    playSynthSquatSound(audioContextRef.current, sound);
  }

  function speakSquatInstruction(text: string, priority = false) {
    setSquatCoachCue(text);
    if (!voiceGuidanceRef.current || !("speechSynthesis" in window)) return;
    duckActiveAudio(priority ? 1.8 : 2.2);
    // Steg 33: Always cancel any previous utterance to eliminate backlog/queuing latency
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sv-SE";
    const voice = getBestVoice("sv");
    if (voice) utterance.voice = voice;
    utterance.rate = priority ? 1.12 : 1.18;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  const handleToggleCyclingPause = useCallback(() => {
    setCyclingIntervalSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, isPaused: !prev.isPaused };
      cyclingIntervalSessionRef.current = next;
      if (next.isPaused) {
        speakSquatInstruction("Intervallpasset är pausat.", true);
      } else {
        speakSquatInstruction("Återupptar passet.", true);
      }
      return next;
    });
  }, []);

  const handleSkipCyclingStep = useCallback(() => {
    setCyclingIntervalSession((prev) => {
      if (!prev) return prev;
      const next = skipToNextCyclingInterval(prev);
      cyclingIntervalSessionRef.current = next;
      lastCyclingStepIdRef.current = next.currentStep.id;
      if (cyclingVoiceEnabled) {
        speakSquatInstruction(next.currentStep.voiceCue, true);
      }
      return next;
    });
  }, [cyclingVoiceEnabled]);

  const handleFinishCyclingSession = useCallback(() => {
    void handleSaveSessionToLog();
  }, []);

  useEffect(() => {
    if (activeWorkoutExercise !== "cycling-intervals-30") return;
    if (!cyclingIntervalSession || cyclingIntervalSession.isPaused || cyclingIntervalSession.isCompleted) return;

    const timer = setInterval(() => {
      setCyclingIntervalSession((prev) => {
        if (!prev || prev.isPaused || prev.isCompleted) return prev;
        const next = advanceCyclingIntervalSession(prev, 1);
        cyclingIntervalSessionRef.current = next;

        if (next.currentStep.id !== lastCyclingStepIdRef.current) {
          lastCyclingStepIdRef.current = next.currentStep.id;
          if (cyclingVoiceEnabled) {
            speakSquatInstruction(next.currentStep.voiceCue, true);
          }
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeWorkoutExercise, cyclingIntervalSession?.isPaused, cyclingIntervalSession?.isCompleted, cyclingVoiceEnabled]);

  function speakArenaInstruction(cue: MotionArenaCue) {
    if (!voiceGuidanceRef.current || !("speechSynthesis" in window)) return;
    const now = performance.now();
    if (!cue.priority && (now - lastArenaSpeechAtRef.current < 3_500 || window.speechSynthesis.speaking)) {
      return;
    }
    duckActiveAudio(cue.kind === "duck" ? 1.5 : 2.0);
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
      speakBaselineInstruction("Röst på. Jag guidar squat-testet, baslinjen och bossfighten.");
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

  function resetSquatTracking(resetWorkout = false) {
    const next = createSquatTrackerState();
    squatTrackerRef.current = next;
    lastSquatUiAtRef.current = 0;
    setSquatView(next);
    setSquatReportCopied(false);
    if (resetWorkout && squatProtocolRef.current === "workout-step-31") {
      workoutSessionRef.current = createConfiguredWorkoutSession();
      setWorkoutSession(workoutSessionRef.current);
    }
    if (activeWorkoutExercise in EXERCISE_LIBRARY) {
      const nextUnified = createUnifiedExerciseTracker(activeWorkoutExercise as TrackableExerciseId);
      unifiedTrackerRef.current = nextUnified;
      setUnifiedTracker(nextUnified);
      lastUnifiedRepRef.current = 0;
      lastUnifiedHoldRef.current = 0;
    }
  }

  function handleSkipRest() {
    if (programSessionRef.current && programSessionRef.current.phase === "resting") {
      const nextProg = skipProgramRest(programSessionRef.current);
      programSessionRef.current = nextProg;
      setProgramSession(nextProg);
      playSquatSound("rep");

      if (nextProg.phase === "completed") {
        clearProgramSessionSnapshot();
        setSavedProgramSnapshot(null);
        playGameSound(null, true);
        const summary = generateProgramSummary(nextProg, WORKOUT_PROGRAMS[nextProg.programId]);
        setProgramSummary(summary);
        speakSquatInstruction(
          `Grymt jobbat! Hela passet är avklarat. ${summary.totalReps} repetitioner och ${summary.xpEarned} erfarenhetspoäng intjänade!`,
          true,
        );
      } else {
        saveProgramSessionSnapshot(nextProg);
        setSavedProgramSnapshot(nextProg);
        const nextExId = nextProg.activeExercise.exerciseId;
        const exName = EXERCISE_LIBRARY[nextExId]?.name ?? nextExId;
        speakSquatInstruction(
          `Startar Set ${nextProg.currentSet} av ${nextProg.activeExercise.sets} för ${exName}.`,
          true,
        );
        const tracker = createUnifiedExerciseTracker(nextExId);
        unifiedTrackerRef.current = tracker;
        setUnifiedTracker(tracker);
        lastUnifiedRepRef.current = 0;
        lastUnifiedHoldRef.current = 0;
      }
      return;
    }

    const nextSession = skipWorkoutRest(workoutSessionRef.current, performance.now());
    workoutSessionRef.current = nextSession;
    setWorkoutSession(nextSession);
    coachDisciplineRef.current = createWorkoutCoachDisciplineState();
    resetSquatTracking();
    if (nextSession.status === "completed") {
      playGameSound(null, true);
      speakSquatInstruction("Träningspasset är slutfört! Alla set avklarade.", true);
    } else {
      speakSquatInstruction(`Startar set ${nextSession.currentSetIndex + 1}! Gör dig redo.`, true);
    }
  }

  function handleRecordRpe(setIndex: number, rpe: "easy" | "moderate" | "hard") {
    const current = workoutSessionRef.current;
    const updated = recordSetRpe(current, setIndex, rpe);
    const completedSet = updated.completedSets[setIndex];
    if (completedSet) {
      const adjustment = calculateNextSetTarget(completedSet, current.config.targetRepsPerSet);
      const withAdjustment = applyNextSetAdjustment(updated, adjustment.targetReps);
      workoutSessionRef.current = withAdjustment;
      setWorkoutSession(withAdjustment);
      const rpeSwedish = rpe === "easy" ? "Lätt" : rpe === "moderate" ? "Lagom" : "Tungt";
      speakSquatInstruction(`${rpeSwedish}. ${adjustment.adjustmentReason}`, false);
      return;
    }
    workoutSessionRef.current = updated;
    setWorkoutSession(updated);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (workoutSession.status !== "resting") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const lastSetIndex = workoutSession.completedSets.length - 1;
      if (lastSetIndex < 0) return;

      if (event.key === "1") {
        event.preventDefault();
        handleRecordRpe(lastSetIndex, "easy");
      } else if (event.key === "2") {
        event.preventDefault();
        handleRecordRpe(lastSetIndex, "moderate");
      } else if (event.key === "3") {
        event.preventDefault();
        handleRecordRpe(lastSetIndex, "hard");
      } else if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        handleSkipRest();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workoutSession.status, workoutSession.completedSets.length]);

  async function copySquatReport() {
    let reportJson: string;
    if (activeWorkoutExercise === "pushup" && unifiedTrackerRef.current.exerciseId === "pushup") {
      const pState = unifiedTrackerRef.current.trackerState as PushupTrackerState;
      reportJson = JSON.stringify(buildPushupTestReport(pState), null, 2);
    } else if (activeWorkoutExercise === "lunge" && unifiedTrackerRef.current.exerciseId === "lunge") {
      const lState = unifiedTrackerRef.current.trackerState as LungeTrackerState;
      reportJson = JSON.stringify(buildLungeTestReport(lState), null, 2);
    } else if (activeWorkoutExercise === "overhead-press" && unifiedTrackerRef.current.exerciseId === "overhead-press") {
      const opState = unifiedTrackerRef.current.trackerState as OverheadPressTrackerState;
      reportJson = JSON.stringify(buildOverheadPressTestReport(opState), null, 2);
    } else if (squatProtocolRef.current === "workout-step-31") {
      reportJson = JSON.stringify(buildWorkoutSessionReport(workoutSessionRef.current), null, 2);
    } else {
      reportJson = JSON.stringify(
        buildSquatTestReport(squatTrackerRef.current, new Date().toISOString(), squatProtocolRef.current),
        null,
        2,
      );
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportJson);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = reportJson;
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand("copy");
        textArea.remove();
        if (!copied) throw new Error("copy failed");
      }
      setSquatReportCopied(true);
      if (squatReportCopiedTimerRef.current !== null) clearTimeout(squatReportCopiedTimerRef.current);
      squatReportCopiedTimerRef.current = setTimeout(() => setSquatReportCopied(false), 2_000);
    } catch {
      setError("Provrapporten kunde inte kopieras. Landmark-filen kan fortfarande laddas ned.");
    }
  }

  function downloadSquatReport() {
    if (activeWorkoutExercise === "pushup" && unifiedTrackerRef.current.exerciseId === "pushup") {
      const pState = unifiedTrackerRef.current.trackerState as PushupTrackerState;
      const report = buildPushupTestReport(pState);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `armhavning-provrapport-${report.testedAt.slice(0, 19).replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (activeWorkoutExercise === "lunge" && unifiedTrackerRef.current.exerciseId === "lunge") {
      const lState = unifiedTrackerRef.current.trackerState as LungeTrackerState;
      const report = buildLungeTestReport(lState);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `utfall-provrapport-${report.testedAt.slice(0, 19).replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (activeWorkoutExercise === "overhead-press" && unifiedTrackerRef.current.exerciseId === "overhead-press") {
      const opState = unifiedTrackerRef.current.trackerState as OverheadPressTrackerState;
      const report = buildOverheadPressTestReport(opState);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `axelpress-provrapport-${report.testedAt.slice(0, 19).replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (squatProtocolRef.current === "workout-step-31") {
      const report = buildWorkoutSessionReport(workoutSessionRef.current);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `motion-workout-report-${new Date().toISOString().replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    const report = buildSquatTestReport(squatTrackerRef.current, new Date().toISOString(), squatProtocolRef.current);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `motion-squat-test-${report.createdAt.replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function toggleSquatTracking() {
    const enabled = !squatTrackingEnabledRef.current;
    squatTrackingEnabledRef.current = enabled;
    setSquatTrackingEnabled(enabled);
    if (enabled) {
      resetSquatTracking();
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      void audioContextRef.current.resume();
      if (!voiceGuidanceRef.current) {
        voiceGuidanceRef.current = true;
        setVoiceGuidance(true);
      }
      lastSquatCoachAtRef.current = performance.now();
      const prog = WORKOUT_PROGRAMS[activeWorkoutExercise as ProgramId];
      if (prog) {
        const sess = createProgramSession(prog);
        programSessionRef.current = sess;
        setProgramSession(sess);
        setProgramSummary(null);
        saveProgramSessionSnapshot(sess);
        setSavedProgramSnapshot(sess);
        const firstExId = sess.activeExercise.exerciseId;
        const initialTracker = createUnifiedExerciseTracker(firstExId);
        unifiedTrackerRef.current = initialTracker;
        setUnifiedTracker(initialTracker);
        lastUnifiedRepRef.current = 0;
        lastUnifiedHoldRef.current = 0;
        const firstExName = EXERCISE_LIBRARY[firstExId]?.name ?? firstExId;
        speakSquatInstruction(
          `Startar program: ${prog.title}. Första övningen är ${firstExName}. Set 1 av ${sess.activeExercise.sets}. Gör dig redo!`,
          true,
        );
        return;
      }

      if (activeWorkoutExercise === "cycling-intervals-30") {
        const initialTracker = createUnifiedExerciseTracker("cycling");
        unifiedTrackerRef.current = initialTracker;
        setUnifiedTracker(initialTracker);
        lastUnifiedRepRef.current = 0;
        lastUnifiedHoldRef.current = 0;
        speakSquatInstruction("Kadens- och trampvarvmätning aktiv.", true);
        return;
      }

      const activeLibraryId = activeWorkoutExercise as TrackableExerciseId;
      const libEx = EXERCISE_LIBRARY[activeLibraryId];
      if (libEx && activeWorkoutExercise !== "squat") {
        const initialTracker = createUnifiedExerciseTracker(activeLibraryId);
        unifiedTrackerRef.current = initialTracker;
        setUnifiedTracker(initialTracker);
        lastUnifiedRepRef.current = 0;
        lastUnifiedHoldRef.current = 0;
        const guide = getLibraryCameraGuidance(activeLibraryId);
        speakSquatInstruction(`${libEx.name}. ${guide.instruction}. Börja när du är redo!`, true);
        return;
      }

      if (squatProtocolRef.current === "workout-step-31") {
        workoutSessionRef.current = startWorkoutSession(createConfiguredWorkoutSession(), performance.now());
        setWorkoutSession(workoutSessionRef.current);
        coachDisciplineRef.current = createWorkoutCoachDisciplineState();
        speakSquatInstruction(
          initialMissionLaunch?.exerciseId === "squat"
            ? `Dagens knäböjsset startar. Målet är ${initialMissionLaunch.targetReps} repetitioner.`
            : "Träningspass 3 gånger 10 knäböj startar! Gör dig redo för set 1.",
          true,
        );
      } else if (squatProtocolRef.current === "symmetry-step-26") {
        speakSquatInstruction(
          "Steg 26 Symmetritest startar. Gör första repetitionen med jämn belastning, och därefter två repetitioner med lätt sidoförskjutning.",
          true,
        );
      } else if (squatProtocolRef.current === "tempo-step-25") {
        speakSquatInstruction(
          "Steg 25 Tempo-test startar. Gör 1 vanlig repetition, 1 långsam kontrollerad med 3 sekunder nedåt, och 1 pausknäböj med 2 sekunder i botten. Jag mäter varje fas.",
          true,
        );
      } else {
        speakSquatInstruction(
          "Personligt ROM-test startar. Gör tio repetitioner mot stolen för halva böj, och därefter tio djupa utan stol. Jag guidar varje rep.",
          true,
        );
      }
    } else {
      window.speechSynthesis?.cancel();
    }
  }

  function acceptUnifiedExerciseSnapshot(snapshot: MotionPoseSnapshot) {
    if (!squatTrackingEnabledRef.current) return;
    const canvas = canvasRef.current;
    const aspectRatio = canvas && canvas.height > 0 ? canvas.width / canvas.height : 1;
    const deltaSec = 0.033;

    const currentProg = programSessionRef.current;
    let currentExId: TrackableExerciseId = "squat";
    if (currentProg && currentProg.phase === "active-set") {
      currentExId = currentProg.activeExercise.exerciseId;
    } else if (EXERCISE_LIBRARY[activeWorkoutExercise as TrackableExerciseId]) {
      currentExId = activeWorkoutExercise as TrackableExerciseId;
    } else if (activeWorkoutExercise === "cycling-intervals-30") {
      currentExId = "cycling";
    } else {
      return;
    }

    if (unifiedTrackerRef.current.exerciseId !== currentExId) {
      unifiedTrackerRef.current = createUnifiedExerciseTracker(currentExId);
      lastUnifiedRepRef.current = 0;
      lastUnifiedHoldRef.current = 0;
    }

    const prevTracker = unifiedTrackerRef.current;

    // Steg 80: Utvärdera kameravinkel, höjd och utsnitt för vardagsrumstolerans
    const framing = evaluateExerciseFraming(snapshot.landmarks, currentExId);
    setFramingFeedback(framing);

    if (!framing.isOptimal && voiceGuidanceRef.current) {
      const now = performance.now();
      if (
        framing.advice !== lastSpokenFramingRef.current ||
        now - lastSpokenFramingTimeRef.current > 12_000
      ) {
        // Röstguidning under uppställning / innan repetitioner startat
        const isSetupPhase = !prevTracker || (prevTracker.reps === 0 && (!prevTracker.holdSeconds || prevTracker.holdSeconds < 1));
        if (isSetupPhase) {
          lastSpokenFramingRef.current = framing.advice;
          lastSpokenFramingTimeRef.current = now;
          speakSquatInstruction(framing.advice, false);
        }
      }
    } else if (framing.isOptimal) {
      lastSpokenFramingRef.current = null;
    }

    const nextTracker = advanceUnifiedExerciseTracker(
      prevTracker,
      snapshot.landmarks,
      deltaSec,
      aspectRatio,
      snapshot.timestampMs,
    );
    unifiedTrackerRef.current = nextTracker;
    setUnifiedTracker(nextTracker);

    const isHold = currentExId === "handstand-hold" || currentExId === "plank" || currentExId === "cycling";

    if (!isHold && nextTracker.reps > lastUnifiedRepRef.current) {
      lastUnifiedRepRef.current = nextTracker.reps;
      playSquatSound("rep");
      speakSquatInstruction(`${nextTracker.reps}`, false);

      if (currentProg && currentProg.phase === "active-set") {
        const targetReps = currentProg.activeExercise.reps;
        if (nextTracker.reps >= targetReps) {
          const updatedProg = completeProgramSet(currentProg, nextTracker.reps);
          programSessionRef.current = updatedProg;
          setProgramSession(updatedProg);
          syncProgramToWorkoutMemory(updatedProg);
          const activeExName = EXERCISE_LIBRARY[currentProg.activeExercise.exerciseId]?.name ?? currentProg.activeExercise.exerciseId;
          syncCompletedSetToActiveSnapshot(activeExName, nextTracker.reps);
          playSquatSound("milestone");

          if (updatedProg.phase === "completed") {
            clearProgramSessionSnapshot();
            setSavedProgramSnapshot(null);
            playGameSound(null, true);
            const summary = generateProgramSummary(updatedProg, WORKOUT_PROGRAMS[updatedProg.programId]);
            setProgramSummary(summary);
            speakSquatInstruction(
              `Grymt jobbat! Hela styrkepasset är avklarat. ${summary.totalReps} repetitioner och ${summary.xpEarned} erfarenhetspoäng intjänade!`,
              true,
            );
          } else {
            saveProgramSessionSnapshot(updatedProg);
            setSavedProgramSnapshot(updatedProg);
            speakSquatInstruction(
              `Set ${currentProg.currentSet} klart! Vila i ${currentProg.activeExercise.restSeconds} sekunder.`,
              true,
            );
          }
        }
      } else if (!currentProg && activeWorkoutSnapshot && nextPendingExercise) {
        const nextUndoneSet = nextPendingExercise.sets.find((s: WorkoutMemorySet) => !s.done);
        const targetReps = nextUndoneSet?.reps ? Number(nextUndoneSet.reps) : 0;
        if (targetReps > 0 && nextTracker.reps >= targetReps) {
          syncCompletedSetToActiveSnapshot(nextPendingExercise.name, nextTracker.reps);
          playSquatSound("milestone");
          speakSquatInstruction(`Set klart! ${nextTracker.reps} repetitioner avklarade. Bra jobbat!`, true);
          lastUnifiedRepRef.current = 0;
          const tracker = createUnifiedExerciseTracker(matchedCameraExercise ?? "squat");
          unifiedTrackerRef.current = tracker;
          setUnifiedTracker(tracker);
        }
      }
    } else if (isHold && Math.floor(nextTracker.holdSeconds) > lastUnifiedHoldRef.current) {
      lastUnifiedHoldRef.current = Math.floor(nextTracker.holdSeconds);
      if (lastUnifiedHoldRef.current > 0 && lastUnifiedHoldRef.current % 5 === 0) {
        playSquatSound("rep");
        speakSquatInstruction(`${lastUnifiedHoldRef.current} sekunder`, false);
      }

      if (currentProg && currentProg.phase === "active-set") {
        const targetHold = currentProg.activeExercise.reps;
        if (nextTracker.holdSeconds >= targetHold) {
          const updatedProg = completeProgramSet(currentProg, Math.round(nextTracker.holdSeconds));
          programSessionRef.current = updatedProg;
          setProgramSession(updatedProg);
          syncProgramToWorkoutMemory(updatedProg);
          const activeExName = EXERCISE_LIBRARY[currentProg.activeExercise.exerciseId]?.name ?? currentProg.activeExercise.exerciseId;
          syncCompletedSetToActiveSnapshot(activeExName, 1, Math.round(nextTracker.holdSeconds));
          playSquatSound("milestone");

          if (updatedProg.phase === "completed") {
            clearProgramSessionSnapshot();
            setSavedProgramSnapshot(null);
            playGameSound(null, true);
            const summary = generateProgramSummary(updatedProg, WORKOUT_PROGRAMS[updatedProg.programId]);
            setProgramSummary(summary);
            speakSquatInstruction(
              `Grymt jobbat! Handstående-passet är avklarat. ${summary.xpEarned} erfarenhetspoäng intjänade!`,
              true,
            );
          } else {
            saveProgramSessionSnapshot(updatedProg);
            setSavedProgramSnapshot(updatedProg);
            speakSquatInstruction(
              `Set ${currentProg.currentSet} klart! Vila i ${currentProg.activeExercise.restSeconds} sekunder.`,
              true,
            );
          }
        }
      } else if (!currentProg && activeWorkoutSnapshot && nextPendingExercise) {
        const nextUndoneSet = nextPendingExercise.sets.find((s: WorkoutMemorySet) => !s.done);
        const targetHold = nextUndoneSet?.durationSeconds ? Number(nextUndoneSet.durationSeconds) : 0;
        if (targetHold > 0 && nextTracker.holdSeconds >= targetHold) {
          const holdSec = Math.round(nextTracker.holdSeconds);
          syncCompletedSetToActiveSnapshot(nextPendingExercise.name, 1, holdSec);
          playSquatSound("milestone");
          speakSquatInstruction(`Hålltid klar! ${holdSec} sekunder avklarade. Bra jobbat!`, true);
          lastUnifiedHoldRef.current = 0;
          const tracker = createUnifiedExerciseTracker(matchedCameraExercise ?? "handstand-hold");
          unifiedTrackerRef.current = tracker;
          setUnifiedTracker(tracker);
        }
      }
    }
  }

  function acceptSquatSnapshot(snapshot: MotionPoseSnapshot) {
    if (!squatTrackingEnabledRef.current) return;
    const canvas = canvasRef.current;
    const aspectRatio = canvas && canvas.height > 0 ? canvas.width / canvas.height : 1;
    const previous = squatTrackerRef.current;
    const next = advanceSquatTracker(
      previous,
      measureSquatAngles(snapshot.landmarks, aspectRatio),
      snapshot.timestampMs,
    );
    if (next === previous) return;
    squatTrackerRef.current = next;
    const now = performance.now();

    // 1. Workout Session Mode (Steg 31)
    if (squatProtocolRef.current === "workout-step-31") {
      const workoutResult = advanceWorkoutSession(workoutSessionRef.current, next, now);
      if (workoutResult.session !== workoutSessionRef.current) {
        workoutSessionRef.current = workoutResult.session;
        setWorkoutSession(workoutResult.session);
      }
      if (workoutResult.cue) {
        let cueText = workoutResult.cue.text;
        if (workoutResult.cue.sound === "workout-complete") {
          syncSquatToWorkoutMemory(workoutResult.session);
          playGameSound(null, true);
          const report = buildWorkoutSessionReport(workoutResult.session);
          const { updatedMemory, newPersonalRecords } = updateCoachMemoryWithSession(coachMemoryRef.current, report);
          coachMemoryRef.current = updatedMemory;
          setCoachMemory(updatedMemory);
          try {
            localStorage.setItem("p100_motion_coach_memory", JSON.stringify(updatedMemory));
          } catch {
            // safe
          }
          if (newPersonalRecords.length > 0) {
            const prAnnouncement = newPersonalRecords.join(". ");
            setNewPrNotice(prAnnouncement);
            cueText = `${cueText} ${prAnnouncement}`;
          }
        } else if (workoutResult.cue.sound === "set-complete") {
          syncSquatToWorkoutMemory(workoutResult.session);
          playSquatSound("milestone");
          const lastSet = workoutResult.session.completedSets[workoutResult.session.completedSets.length - 1];
          if (lastSet) {
            syncCompletedSetToActiveSnapshot("Knäböj", lastSet.completedReps);
            cueText = formatCoachSetCompleteCue(
              lastSet.setNumber,
              lastSet.completedReps,
              getRestDurationForSet(workoutResult.session.config, workoutResult.session.currentSetIndex),
              lastSet.primaryObservation,
              coachSettingsRef.current,
            );
          }
        } else if (workoutResult.cue.sound === "rest-end") {
          playSquatSound("rep");
        }
        const safetyChecked = validateCoachSafetyPrompt(cueText);
        speakSquatInstruction(safetyChecked.sanitizedText, workoutResult.cue.priority);
        setSquatCoachCue(safetyChecked.sanitizedText);
        lastSquatCoachAtRef.current = now;
      }
      if (workoutResult.shouldResetSquatTracker) {
        coachDisciplineRef.current = createWorkoutCoachDisciplineState();
        resetSquatTracking();
        return;
      }

      // Spoken counting and sound during active workout set (Steg 33, 34, 35, 41 & 46)
      if (workoutSessionRef.current.status === "active-set" && next.reps > previous.reps) {
        playSquatSound("rep");
        const speechCue = formatCoachRepCue(
          next.reps,
          workoutSessionRef.current.config.targetRepsPerSet,
          coachSettingsRef.current,
          next.lastRep,
          coachDisciplineRef.current,
        );
        coachDisciplineRef.current = speechCue.nextDiscipline;
        const safetyChecked = validateCoachSafetyPrompt(speechCue.text);
        speakSquatInstruction(safetyChecked.sanitizedText, speechCue.isMilestone);
        setSquatCoachCue(
          `Set ${workoutSessionRef.current.currentSetIndex + 1}: ${speechCue.displayCue} (${next.reps}/${workoutSessionRef.current.config.targetRepsPerSet})`,
        );
        lastSquatCoachAtRef.current = now;
      } else if (
        workoutSessionRef.current.status === "active-set"
        && (previous.phase !== "bottom" && next.phase === "bottom")
      ) {
        playSquatSound("full-depth");
      }

      if (
        next.phase !== previous.phase
        || next.reps !== previous.reps
        || next.tracking !== previous.tracking
        || now - lastSquatUiAtRef.current >= 100
      ) {
        lastSquatUiAtRef.current = now;
        setSquatView(next);
      }
      return;
    }

    // 2. Single-protocol evaluation modes (ROM, Tempo, Symmetry)
    const voiceCue = squatVoiceCue(previous, next, squatProtocolRef.current);
    if (voiceCue) {
      if (voiceCue.sound) playSquatSound(voiceCue.sound);
      speakSquatInstruction(voiceCue.text, voiceCue.priority);
      setSquatCoachCue(voiceCue.text);
      lastSquatCoachAtRef.current = now;
    } else if (
      next.tracking
      && next.phase === "standing"
      && next.reps < (squatProtocolRef.current === "rom-step-24" ? 20 : 3)
      && now - lastSquatCoachAtRef.current >= 7_000
    ) {
      lastSquatCoachAtRef.current = now;
      speakSquatInstruction("Kör nästa repetition när du är redo.", false);
    } else if (next.phase !== "standing") {
      lastSquatCoachAtRef.current = now;
    }

    if (
      next.phase !== previous.phase
      || next.reps !== previous.reps
      || next.tracking !== previous.tracking
      || now - lastSquatUiAtRef.current >= 100
    ) {
      lastSquatUiAtRef.current = now;
      setSquatView(next);
    }
  }

  function acceptPoseSnapshot(snapshot: MotionPoseSnapshot) {
    inferencePendingRef.current = false;
    workerStablePosesRef.current += 1;
    if (workerStablePosesRef.current >= 30) workerRestartAttemptsRef.current = 0;

    const receivedAtMs = performance.now();
    snapshotRef.current = snapshot;
    const visible = snapshot.landmarks.length === 33;
    if (
      visible
      && (activeWorkoutExercise === "cycling" || activeWorkoutExercise === "cycling-intervals-30")
      && !squatTrackingEnabledRef.current
      && !cyclingAutoStartedRef.current
    ) {
      cyclingAutoStartedRef.current = true;
      const tracker = createUnifiedExerciseTracker("cycling");
      unifiedTrackerRef.current = tracker;
      setUnifiedTracker(tracker);
      lastUnifiedRepRef.current = 0;
      lastUnifiedHoldRef.current = 0;
      squatTrackingEnabledRef.current = true;
      setSquatTrackingEnabled(true);
      if (activeWorkoutExercise === "cycling-intervals-30") {
        speakSquatInstruction("Kroppen hittad. Optisk kadens- och trampvarvmätning aktiv.", true);
      } else {
        speakSquatInstruction("Kroppen hittad. Spinninguppvärmningen har startat.", true);
      }
    }
    acceptSquatSnapshot(snapshot);
    acceptUnifiedExerciseSnapshot(snapshot);
    if (canStartMotionGame(snapshot)) {
      recentGamePoseRef.current = { snapshot, receivedAtMs };
    }
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
    if (squatTrackingEnabledRef.current) resetSquatTracking();
    cancelReplay();
    replayingRef.current = true;
    setReplaying(true);
    let frameIndex = 0;
    const startedAt = performance.now();
    const firstFrame = recordingData.frames[0];
    const firstSnapshot: MotionPoseSnapshot = {
      capturedAtMs: startedAt,
      timestampMs: 0,
      inferenceMs: firstFrame.inferenceMs,
      landmarks: firstFrame.landmarks,
    };
    snapshotRef.current = firstSnapshot;
    acceptSquatSnapshot(firstSnapshot);
    if (canvasRef.current) drawSnapshot(canvasRef.current, firstSnapshot);
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
      const replaySnapshot: MotionPoseSnapshot = {
        capturedAtMs: now,
        timestampMs: frame.offsetMs,
        inferenceMs: frame.inferenceMs,
        landmarks: frame.landmarks,
      };
      snapshotRef.current = replaySnapshot;
      acceptSquatSnapshot(replaySnapshot);
      if (canvasRef.current) drawSnapshot(canvasRef.current, replaySnapshot);
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

  function startGame(mode: "arcade" | "boss-fight" = "arcade") {
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
    const isBoss = mode === "boss-fight";
    const game = startMotionGame(snapshot, performance.now(), canvas.width / canvas.height, {
      difficulty: diff,
      allowKicks: diff !== "easy" || fullBodyVisibleRef.current || hasUsableFullBody(snapshot.landmarks),
      bossFight: isBoss,
      durationMs: isBoss ? 300_000 : 60_000,
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

  useEffect(() => {
    if (!initialAutoStartCamera || cameraAutoStartAttemptedRef.current) return;
    const timeout = window.setTimeout(() => {
      if (cameraAutoStartAttemptedRef.current) return;
      cameraAutoStartAttemptedRef.current = true;
      void startCamera();
    }, 0);
    return () => window.clearTimeout(timeout);
    // The initial route flag intentionally triggers one camera attempt per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAutoStartCamera]);

  const isStarting = status === "requesting" || status === "loading";
  const isRecovering = status === "recovering";
  const isLive = status === "running" || isRecovering;
  const gameActive = gameView?.status === "countdown" || gameView?.status === "running";
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
  const baselinePassedChecks = baselineReport
    ? Object.values(baselineReport.checks).filter(Boolean).length
    : 0;
  const baselinePhase = motionBaselinePhase(baselineElapsedMs);
  const activeTrackableExerciseId = EXERCISE_LIBRARY[activeWorkoutExercise as TrackableExerciseId]
    ? activeWorkoutExercise as TrackableExerciseId
    : null;
  const matchingCameraSetupProfile = cameraSetupProfile !== null
    && cameraSetupProfile.exerciseId === activeTrackableExerciseId
    && (!initialMissionLaunch || cameraSetupProfile.environment === initialMissionLaunch.environment)
    ? cameraSetupProfile
    : null;

  function resetAfterCameraCalibration(exerciseId: TrackableExerciseId) {
    squatTrackingEnabledRef.current = false;
    setSquatTrackingEnabled(false);
    const tracker = createUnifiedExerciseTracker(exerciseId);
    unifiedTrackerRef.current = tracker;
    setUnifiedTracker(tracker);
    lastUnifiedRepRef.current = 0;
    lastUnifiedHoldRef.current = 0;
    if (exerciseId === "squat") resetSquatTracking(true);
  }

  return (
    <div className="p100-motion-lab">
      <header className="p100-page-head p100-motion-head">
        <div>
          <span>Träna med kamera</span>
          <h1>Motion Lab</h1>
          <p>Räkna rörelser och följ ditt pass. Kamerabilden stannar i webbläsaren.</p>
        </div>
        <div className="p100-head-actions">
          <Link className="p100-button-secondary" href="/projekt-100/traning">Till träningen</Link>
          {isLive || isStarting || status === "error" ? (
            <button className="p100-button-secondary" type="button" onClick={() => disposeEngine()}>
              <VideoOff /> Stäng kamera
            </button>
          ) : null}
          {status === "error" ? <button className="p100-button" type="button" onClick={() => void startCamera()} disabled={isStarting || isRecovering}>
            {isStarting || isRecovering ? <RefreshCw className="p100-spin" /> : <Camera />}
            Försök starta kameran igen
          </button> : null}
        </div>
      </header>

      {activeWorkoutExercise === "cycling" ? (
        <CyclingTestBench
          cyclingTracker={
            unifiedTracker?.exerciseId === "cycling"
              ? (unifiedTracker.trackerState as CyclingTrackerState)
              : null
          }
          isLive={isLive}
          trackingEnabled={squatTrackingEnabled}
          poseVisible={poseVisible}
          onStartCamera={() => void startCamera()}
          onToggleTracking={toggleSquatTracking}
          onResetTracking={resetSquatTracking}
          onProceedToIntervals={() => {
            setActiveWorkoutExercise("cycling-intervals-30");
            const newSess = createCyclingIntervalSession();
            setCyclingIntervalSession(newSess);
            cyclingIntervalSessionRef.current = newSess;
            lastCyclingStepIdRef.current = newSess.currentStep.id;
            const tracker = createUnifiedExerciseTracker("cycling");
            unifiedTrackerRef.current = tracker;
            setUnifiedTracker(tracker);
            speakSquatInstruction("Startar 30 minuters intervallcykling. Första blocket: Uppvärmning med lätt motstånd i 3 minuter. Nu kör vi!", true);
          }}
          onCloseTest={() => {
            if (initialWarmupMissionId) {
              markCyclingWarmupComplete(initialWarmupMissionId);
              router.push("/projekt-100/traning");
            } else {
              setActiveWorkoutExercise("squat");
            }
          }}
        />
      ) : activeWorkoutExercise === "cycling-intervals-30" ? (
        <section className="p100-cycling-warmup-guide">
          <div>
            <span>Kondition · 30 minuter</span>
            <h2>Motionscykel · Intervallpass med motstånd</h2>
            <p>Följ motståndsinstruktionerna på skärmen (Lätt, Medel, Tungt / Trögt). Kameran är valfri – den mäter kadens och trampvarv om du startar den.</p>
          </div>
          <div>
            {!isLive ? (
              <button type="button" onClick={() => void startCamera()} disabled={isStarting}>Starta kamera (valfritt)</button>
            ) : (
              <span style={{ fontSize: "0.85rem", color: "#34d399", fontWeight: 600 }}>Kamera aktiv · Kadens mäts</span>
            )}
          </div>
        </section>
      ) : null}

      {activeWorkoutExercise === "lunge" ? (
        <LungeTestBench
          lungeTracker={
            unifiedTracker?.exerciseId === "lunge"
              ? (unifiedTracker.trackerState as LungeTrackerState)
              : null
          }
          isLive={isLive}
          trackingEnabled={squatTrackingEnabled}
          poseVisible={poseVisible}
          onStartCamera={() => void startCamera()}
          onToggleTracking={toggleSquatTracking}
          onResetTracking={resetSquatTracking}
          onCloseTest={() => setActiveWorkoutExercise("squat")}
        />
      ) : null}

      {activeWorkoutExercise === "overhead-press" ? (
        <OverheadPressTestBench
          pressTracker={
            unifiedTracker?.exerciseId === "overhead-press"
              ? (unifiedTracker.trackerState as OverheadPressTrackerState)
              : null
          }
          isLive={isLive}
          trackingEnabled={squatTrackingEnabled}
          poseVisible={poseVisible}
          onStartCamera={() => void startCamera()}
          onToggleTracking={toggleSquatTracking}
          onResetTracking={resetSquatTracking}
          onCloseTest={() => setActiveWorkoutExercise("squat")}
        />
      ) : null}

      {activeTrackableExerciseId &&
      activeTrackableExerciseId !== "cycling" &&
      activeTrackableExerciseId !== "lunge" &&
      activeTrackableExerciseId !== "overhead-press" ? (
        <AdaptiveCameraSetupPanel
          key={`${activeTrackableExerciseId}-${initialMissionLaunch?.environment ?? "free"}`}
          exerciseId={activeTrackableExerciseId}
          environment={initialMissionLaunch?.environment ?? "home"}
          environmentLocked={Boolean(initialMissionLaunch)}
          resolution={actualResolution ?? resolution.replace("x", " × ")}
          isLive={isLive}
          poseVisible={poseVisible}
          fullBodyVisible={fullBodyVisible}
          luminance={luminance}
          framing={framingFeedback}
          measuredReps={unifiedTracker.reps}
          measuredHoldSeconds={unifiedTracker.holdSeconds}
          onBegin={() => {
            setCameraSetupProfile(null);
            if (!squatTrackingEnabledRef.current) toggleSquatTracking();
          }}
          onFinish={(profile) => {
            setCameraSetupProfile(profile);
            resetAfterCameraCalibration(activeTrackableExerciseId);
          }}
          onCancel={() => resetAfterCameraCalibration(activeTrackableExerciseId)}
        />
      ) : null}

      {initialMissionLaunch ? (
        <MotionMissionSyncPanel
          launch={initialMissionLaunch}
          activeExerciseId={activeTrackableExerciseId}
          measuredReps={unifiedTracker.reps}
          measuredHoldSeconds={unifiedTracker.holdSeconds}
          trackingEnabled={squatTrackingEnabled}
          cameraSetupProfile={matchingCameraSetupProfile}
          onSetSaved={() => {
            squatTrackingEnabledRef.current = false;
            setSquatTrackingEnabled(false);
            const tracker = createUnifiedExerciseTracker(initialMissionLaunch.exerciseId);
            unifiedTrackerRef.current = tracker;
            setUnifiedTracker(tracker);
            lastUnifiedRepRef.current = 0;
            lastUnifiedHoldRef.current = 0;
            if (initialMissionLaunch.exerciseId === "squat") {
              resetSquatTracking(true);
            }
          }}
        />
      ) : null}

      {activeWorkoutSnapshot ? (
        <div className="p100-active-camera-banner" role="region" aria-label="Aktivt träningspass i kameravy">
          <div className="p100-active-camera-header">
            <div>
              <span className="p100-active-camera-badge">Aktivt pass</span>
              <h2 className="p100-active-camera-title">{activeWorkoutSnapshot.title}</h2>
            </div>
            <div className="p100-active-camera-actions">
              <button
                type="button"
                className="p100-btn p100-btn-ghost"
                onClick={() => {
                  window.location.href = "/projekt-100/traning";
                }}
              >
                Tillbaka till lugn vy
              </button>
              <button
                type="button"
                className="p100-btn p100-btn-primary"
                disabled={isSavingToLog || !activeWorkoutSnapshot.exercises.some((e) => e.sets.some((s) => s.done))}
                onClick={() => void handleSaveSessionToLog()}
              >
                {isSavingToLog ? "Sparar..." : isSavedToLog ? "Sparat i loggen!" : "Spara genomförda set"}
              </button>
            </div>
          </div>

          <div className="p100-active-camera-body">
            {nextPendingExercise ? (
              <div className="p100-active-camera-current">
                <div className="p100-active-camera-current-info">
                  <span className="p100-active-camera-label">Aktuell övning:</span>
                  <strong>{nextPendingExercise.name}</strong>
                  <span className="p100-active-camera-target">
                    Set {nextPendingExercise.sets.findIndex((s: WorkoutMemorySet) => !s.done) + 1} av {nextPendingExercise.sets.length}
                    {nextPendingSet?.reps ? ` · Mål: ${nextPendingSet.reps} reps` : ""}
                    {nextPendingSet?.durationSeconds ? ` · Mål: ${nextPendingSet.durationSeconds} sek` : ""}
                  </span>
                  <span className="p100-active-camera-tracking-status">
                    {matchedCameraExercise ? `Kamera aktiv (${matchedCameraExercise})` : "Fri form / manuell registrering"}
                  </span>
                </div>
                <button
                  type="button"
                  className="p100-btn p100-btn-secondary"
                  onClick={() => {
                    const targetReps = nextPendingSet?.reps ? Number(nextPendingSet.reps) : 1;
                    const targetHold = nextPendingSet?.durationSeconds ? Number(nextPendingSet.durationSeconds) : undefined;
                    syncCompletedSetToActiveSnapshot(nextPendingExercise.name, targetReps, targetHold);
                  }}
                >
                  Markera set klart
                </button>
              </div>
            ) : (
              <div className="p100-active-camera-all-done">
                <p>Alla set i passet är markerade som klara!</p>
              </div>
            )}
          </div>
          {saveLogError ? <p className="p100-active-camera-error">{saveLogError}</p> : null}
        </div>
      ) : null}

      <section className="p100-motion-grid">
        <div ref={stageRef} className={`p100-motion-stage ${replaying ? "replaying" : ""} ${gameActive ? "game-active" : ""} ${viewportFullscreen ? "viewport-fullscreen" : ""}`} style={{ aspectRatio: cameraAspectRatio ?? `${requestedWidth} / ${requestedHeight}`, maxWidth: fullscreen ? undefined : `calc(72svh * ${cameraAspectRatio ?? Number(requestedWidth) / Number(requestedHeight)})` }}>
          <video ref={videoRef} muted playsInline aria-label="Spegelvänd kamerabild" />
          <canvas ref={canvasRef} aria-label="Pose-overlay med kroppens landmärken" />
          <MotionStageTopBar
            isLive={isLive}
            isRecovering={isRecovering}
            delegate={showDiagnostics ? delegate : null}
            poseExecutionMode={poseExecutionMode}
            replaying={replaying}
            gameActive={gameActive}
            squatTrackingEnabled={false}
            squatReps={squatView.reps}
            baselineRunning={baselineRunning}
            baselineElapsedMs={baselineElapsedMs}
            performanceProfileRunning={performanceProfileRunning}
            performanceProfileMode={performanceProfileMode}
            performanceProfileElapsedMs={performanceProfileElapsedMs}
            performanceProfileSecondsLeft={performanceProfileSecondsLeft}
            fullscreen={fullscreen}
            voiceGuidance={voiceGuidance}
            inputSource={inputSource}
            remoteSensorNotice={remoteNotice}
            onStopGame={stopGame}
            onToggleFullscreen={toggleFullscreen}
            onToggleVoiceGuidance={toggleVoiceGuidance}
          />
          {status === "idle" && inputSource === "webcam" ? (
            <div className="p100-motion-stage-empty">
              <span><Video /></span>
              <strong>Redo för första rörelsen</strong>
              <p>Tillåt kameran och placera dig så att rörelsen syns i bild.</p>
              <button type="button" onClick={() => void startCamera()}><Play /> Starta kamera</button>
            </div>
          ) : null}
          {inputSource === "remote-sensor" && !remoteConnected ? (
            <div className="p100-motion-stage-empty">
              <span><Smartphone /></span>
              <strong>Trådlös iPhone Sensor</strong>
              <p>Öppna sensorsidan på din iPhone via Wi-Fi och ange parningskoden:</p>
              <div style={{ margin: "12px 0", padding: "8px 24px", borderRadius: 12, background: "rgba(125,232,255,0.14)", border: "1px solid rgba(125,232,255,0.32)", fontSize: "1.6rem", letterSpacing: "0.18em", color: "#7de8ff", fontWeight: 900 }}>
                {remotePairingCode}
              </div>
              <p style={{ fontSize: "0.72rem", color: "#8a968f", maxWidth: "44ch" }}>
                Gå till <code>/projekt-100/traning/motion/sensor?pair={remotePairingCode}</code> på iPhonen och ställ telefonen lutad under TV:n.
              </p>
            </div>
          ) : null}
          {isStarting ? (
            <div className="p100-motion-stage-empty loading">
              <span><RefreshCw /></span>
              <strong>{status === "requesting" ? "Startar kameran" : "Laddar lokal poseanalys"}</strong>
              <p>Första modellstarten kan ta några sekunder. Inga videor laddas upp.</p>
            </div>
          ) : null}
          {isLive && activeWorkoutExercise !== "cycling" && activeWorkoutExercise !== "cycling-intervals-30" && !isRecovering && (!poseVisible || !fullBodyVisible) && !replaying && !gameActive && !performanceProfileRunning ? (
            <div className="p100-motion-guide">
              <strong>{poseVisible ? "Hela kroppen behöver synas" : "Ingen kropp hittad ännu"}</strong>
              <span>Backa, centrera dig och se till att huvud, höfter, knän, anklar och båda fötterna ryms i bild.</span>
            </div>
          ) : null}
          {activeWorkoutExercise === "cycling-intervals-30" && cyclingIntervalSession ? (
            <CyclingIntervalOverlay
              session={cyclingIntervalSession}
              measuredCadenceRpm={
                unifiedTracker?.exerciseId === "cycling"
                  ? (unifiedTracker.trackerState as CyclingTrackerState).cadenceRpm
                  : null
              }
              measuredRevolutions={
                unifiedTracker?.exerciseId === "cycling"
                  ? (unifiedTracker.trackerState as CyclingTrackerState).revolutions
                  : unifiedTracker?.reps ?? 0
              }
              isLive={isLive}
              onTogglePause={handleToggleCyclingPause}
              onSkipStep={handleSkipCyclingStep}
              onToggleVoice={() => setCyclingVoiceEnabled((prev) => !prev)}
              voiceEnabled={cyclingVoiceEnabled}
              onFinish={handleFinishCyclingSession}
              onSaveToLog={handleSaveSessionToLog}
              isSavedToLog={isSavedToLog}
              isSavingToLog={isSavingToLog}
              saveLogError={saveLogError}
            />
          ) : squatTrackingEnabled && !gameActive && !baselineRunning && !performanceProfileRunning ? (
            <MotionWorkoutOverlay
              workoutSession={workoutSession}
              squatView={squatView}
              squatProtocol={squatProtocol}
              squatCoachCue={squatCoachCue}
              coachSettings={coachSettings}
              newPrNotice={newPrNotice}
              onSkipRest={handleSkipRest}
              onRecordRpe={handleRecordRpe}
              nowMs={performance.now()}
              activeExerciseTitle={activeExerciseTitle}
              unifiedTracker={activeWorkoutExercise !== "squat" || programSession !== null ? unifiedTracker : null}
              programSession={programSession}
              programSummary={programSummary}
              framingFeedback={framingFeedback}
              onSaveToLog={handleSaveSessionToLog}
              isSavedToLog={isSavedToLog}
              isSavingToLog={isSavingToLog}
              saveLogError={saveLogError}
            />
          ) : null}
          {gameView ? <MotionArenaOverlay
            gameView={gameView}
            gameActive={gameActive}
            arenaLanguage={arenaLanguage}
            difficulty={difficulty}
            fullscreen={fullscreen}
            isLive={isLive}
            isRecovering={isRecovering}
            poseVisible={poseVisible}
            replaying={replaying}
            baselineRunning={baselineRunning}
            performanceProfileRunning={performanceProfileRunning}
            squatTrackingEnabled={squatTrackingEnabled}
            onStartGame={startGame}
            onStopGame={stopGame}
            onToggleFullscreen={toggleFullscreen}
          /> : null}
          <MotionDiagnosticsOverlay
            baselineRunning={baselineRunning}
            baselineElapsedMs={baselineElapsedMs}
            baselineProgress={baselineProgress}
            performanceProfileRunning={performanceProfileRunning}
            performanceProfileMode={performanceProfileMode}
            performanceProfileCountdown={performanceProfileCountdown}
            performanceProfileProgress={performanceProfileProgress}
            performanceProfileElapsedMs={performanceProfileElapsedMs}
            baselineNotice={baselineNotice}
            baselineReport={baselineReport}
            reportCopied={reportCopied}
            replaying={replaying}
            recordingData={recordingData}
            replayProgressRef={replayProgressRef}
            onCloseBaselineNotice={() => setBaselineNotice(null)}
            onDownloadBaselineReport={downloadBaselineReport}
            onCopyBaselineReport={copyBaselineReport}
          />
          {isRecovering ? (
            <div className="p100-motion-recovery" role="status" aria-live="polite">
              <RefreshCw className="p100-spin" />
              <span>
                <strong>Posemotorn återansluter…</strong>
                Försök {workerRecoveryAttempt ?? 1} av {MOTION_WORKER_MAX_RESTARTS}. Bossfightens klocka är pausad.
              </span>
            </div>
          ) : null}
          {error ? (
            <div className="p100-motion-error" role="alert">
              <VideoOff />
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span>
                  <strong>Något stoppade motorn</strong>
                  {error}
                </span>
                <Link
                  href="/projekt-100/traning"
                  className="p100-button p100-motion-fallback-btn"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "fit-content",
                    fontSize: "0.85rem",
                    padding: "8px 14px",
                    textDecoration: "none",
                  }}
                >
                  Fortsätt passet manuellt
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="p100-motion-sidebar">
          {activeWorkoutExercise !== "cycling" && activeWorkoutExercise !== "cycling-intervals-30" ? (
            <div className="p100-motion-session-control">
              <strong>{activeExerciseTitle}</strong>
              <button className="p100-button" type="button" onClick={toggleSquatTracking} disabled={!isLive || isRecovering || (!poseVisible && !squatTrackingEnabled) || gameActive || replaying || baselineRunning || performanceProfileRunning}>
                {squatTrackingEnabled ? "Pausa mätning" : "Starta mätning"}
              </button>
            </div>
          ) : null}
          <MotionCameraControls
            resolution={resolution}
            actualResolution={actualResolution}
            changingResolution={changingResolution}
            arenaLanguage={arenaLanguage}
            difficulty={difficulty}
            isLive={isLive}
            status={status}
            poseVisible={poseVisible}
            fullBodyVisible={fullBodyVisible}
            lightOkay={lightOkay}
            luminance={luminance}
            disabled={isStarting || isRecovering || changingResolution || baselineRunning || performanceProfileRunning}
            inputSource={inputSource}
            remotePairingCode={remotePairingCode}
            onChangeInputSource={changeInputSource}
            onChangeResolution={changeResolution}
            onChangeArenaLanguage={changeArenaLanguage}
            onChangeDifficulty={changeDifficulty}
          />

          <details className="p100-block-details">
            <summary>Övningar och träningsinställningar</summary>
          <MotionWorkoutPanel
            workoutSession={workoutSession}
            squatView={squatView}
            squatProtocol={squatProtocol}
            squatTrackingEnabled={squatTrackingEnabled}
            restPreset={restPreset}
            coachSettings={coachSettings}
            coachMemory={coachMemory}
            squatReportCopied={squatReportCopied}
            nowMs={performance.now()}
            activeExercise={activeWorkoutExercise}
            onChangeExercise={(exercise) => {
              setCameraSetupProfile(null);
              setActiveWorkoutExercise(exercise);
              if (exercise === "cycling-intervals-30") {
                const newSess = createCyclingIntervalSession();
                setCyclingIntervalSession(newSess);
                cyclingIntervalSessionRef.current = newSess;
                lastCyclingStepIdRef.current = newSess.currentStep.id;
                const tracker = createUnifiedExerciseTracker("cycling");
                unifiedTrackerRef.current = tracker;
                setUnifiedTracker(tracker);
                speakSquatInstruction("Startar 30 minuters intervallcykling. Första blocket: Uppvärmning med lätt motstånd i 3 minuter. Nu kör vi!", true);
                return;
              }
              const progItem = WORKOUT_PROGRAMS[exercise as ProgramId];
              const libraryExerciseId = exercise as TrackableExerciseId;
              const libItem = EXERCISE_LIBRARY[libraryExerciseId];

              if (progItem) {
                const firstEx = EXERCISE_LIBRARY[progItem.exercises[0].exerciseId]?.name || "Knäböj";
                speakSquatInstruction(`Startar program: ${progItem.title}. Första övningen är ${firstEx}. Gör dig redo!`);
              } else if (libItem) {
                const guide = getLibraryCameraGuidance(libraryExerciseId);
                speakSquatInstruction(`${libItem.name}. ${guide.instruction}`);
              } else if (exercise === "circuit") {
                speakSquatInstruction("15 minuters helkroppscirkel. Första övningen är Knäböj. Kör!");
              } else {
                const guide = getExerciseCameraGuidance(exercise as ExerciseType);
                const profile = getExerciseProfile(exercise as ExerciseType);
                speakSquatInstruction(`${profile.name}. ${guide.instruction}`);
              }
            }}
            onChangeRestPreset={changeRestPreset}
            onChangeCoachSettings={changeCoachSettings}
            onToggleSquatTracking={toggleSquatTracking}
            onResetSquatTracking={resetSquatTracking}
            onCopySquatReport={copySquatReport}
            onDownloadSquatReport={downloadSquatReport}
            onSkipRest={handleSkipRest}
            onRecordRpe={handleRecordRpe}
            framingFeedback={framingFeedback}
            savedProgramSnapshot={savedProgramSnapshot}
            onResumeProgram={handleResumeProgramSession}
            onDiscardProgram={handleDiscardProgramSession}
            onSaveToLog={handleSaveSessionToLog}
            isSavedToLog={isSavedToLog}
            isSavingToLog={isSavingToLog}
            saveLogError={saveLogError}
          />

          </details>

          <details className="p100-block-details">
            <summary>Spela · valfritt</summary>
            <p>En fristående rörelselek när du vill.</p>
            <button className="p100-button-secondary" type="button" onClick={() => startGame("boss-fight")} disabled={!isLive || isRecovering || !poseVisible || replaying || gameActive || baselineRunning || performanceProfileRunning || squatTrackingEnabled}>
              <Swords /> Starta Boss fight
            </button>
            {!isLive ? <p>Starta kameran först.</p> : null}
          </details>

          <details className="p100-block-details" onToggle={(event) => setShowDiagnostics(event.currentTarget.open)}>
            <summary>Felsökning</summary>
          {showDiagnostics ? <MotionDiagnosticsPanel
            metrics={metrics}
            performanceProfileRunning={performanceProfileRunning}
            performanceProfileMode={performanceProfileMode}
            performanceProfileCountdown={performanceProfileCountdown}
            performanceProfileDurationMs={performanceProfileDurationMs}
            performanceProfileElapsedMs={performanceProfileElapsedMs}
            performanceProfileReport={performanceProfileReport}
            performanceProfileCopied={performanceProfileCopied}
            onStartPerformanceProfile={startPerformanceProfile}
            onFinishPerformanceProfile={finishPerformanceProfile}
            onCopyPerformanceProfile={copyPerformanceProfile}
            onDownloadPerformanceProfile={downloadPerformanceProfile}
            coldStarts={coldStarts}
            onResetColdStarts={resetColdStarts}
            onSimulateWorkerFailure={simulateWorkerFailure}
            status={status}
            poseExecutionMode={poseExecutionMode}
            recording={recording}
            recordedFrameCount={recordedFrameCount}
            recordingData={recordingData}
            replaying={replaying}
            onBeginRecording={beginRecording}
            onFinishRecording={finishRecording}
            onReplayRecording={replayRecording}
            onCancelReplay={cancelReplay}
            onDownloadRecording={downloadRecording}
            baselineRunning={baselineRunning}
            baselineElapsedMs={baselineElapsedMs}
            baselineProgress={baselineProgress}
            baselinePhaseId={baselinePhase.id}
            baselineReport={baselineReport}
            baselinePassedChecks={baselinePassedChecks}
            voiceGuidance={voiceGuidance}
            reportCopied={reportCopied}
            luminance={luminance}
            lightOkay={lightOkay}
            fullBodyVisible={fullBodyVisible}
            onToggleVoiceGuidance={toggleVoiceGuidance}
            onStartBaseline={startBaseline}
            onFinishBaseline={finishBaseline}
            onCopyBaselineReport={copyBaselineReport}
            onDownloadBaselineReport={downloadBaselineReport}
            isLive={isLive}
            isRecovering={isRecovering}
            gameActive={gameActive}
            squatTrackingEnabled={squatTrackingEnabled}
            remoteSensorDiagnostics={{
              inputSource,
              pairingCode: remotePairingCode,
              connected: remoteConnected,
              fps: remoteFps,
              batteryLevel: remoteBattery,
              latencyStats: remoteLatencyTrackerRef.current.getStats(),
              notice: remoteNotice,
              onSelectInputSource: changeInputSource,
            }}
          /> : null}
          </details>
        </aside>
      </section>

      <footer className="p100-motion-footnote"><Gauge /> Kamerabilden behandlas lokalt på din enhet.</footer>
    </div>
  );
}
