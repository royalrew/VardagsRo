"use client";

import { Camera, CheckCircle2, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  cameraEnvironmentAdvice,
  createSavedCameraSetupProfile,
  evaluateAdaptiveCameraSetup,
  getAdaptiveCameraRequirement,
  type AdaptiveCameraSample,
  type SavedCameraSetupProfile,
} from "@/lib/motion-adaptive-camera";
import type { ExerciseFramingFeedback } from "@/lib/motion-camera-coach";
import type { TrackableExerciseId } from "@/lib/motion-library";
import type { TrainingEnvironment } from "@/lib/motion-equipment";

const STORAGE_KEY = "projekt100.motion-camera-setups.v1";

function saveProfile(profile: SavedCameraSetupProfile) {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedCameraSetupProfile[];
    const withoutCurrent = Array.isArray(current)
      ? current.filter((item) => !(item.environment === profile.environment && item.exerciseId === profile.exerciseId))
      : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...withoutCurrent, profile]));
  } catch {
    // Calibration still works for this set if local persistence is unavailable.
  }
}

export function AdaptiveCameraSetupPanel({
  exerciseId,
  environment,
  environmentLocked = false,
  resolution,
  isLive,
  poseVisible,
  fullBodyVisible,
  luminance,
  framing,
  measuredReps,
  measuredHoldSeconds,
  onBegin,
  onFinish,
  onCancel,
}: {
  exerciseId: TrackableExerciseId;
  environment: TrainingEnvironment;
  environmentLocked?: boolean;
  resolution: string;
  isLive: boolean;
  poseVisible: boolean;
  fullBodyVisible: boolean;
  luminance: number | null;
  framing: ExerciseFramingFeedback | null;
  measuredReps: number;
  measuredHoldSeconds: number;
  onBegin: () => void;
  onFinish: (profile: SavedCameraSetupProfile) => void;
  onCancel: () => void;
}) {
  const [active, setActive] = useState(false);
  const [selectedEnvironment, setSelectedEnvironment] = useState(environment);
  const [samples, setSamples] = useState<AdaptiveCameraSample[]>([]);
  const [savedProfile, setSavedProfile] = useState<SavedCameraSetupProfile | null>(null);
  const [baselineReps, setBaselineReps] = useState(0);
  const [baselineHoldSeconds, setBaselineHoldSeconds] = useState(0);
  const liveValuesRef = useRef({ poseVisible, fullBodyVisible, luminance, framing });
  const requirement = getAdaptiveCameraRequirement(exerciseId);

  useEffect(() => {
    liveValuesRef.current = { poseVisible, fullBodyVisible, luminance, framing };
  }, [framing, fullBodyVisible, luminance, poseVisible]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const current = liveValuesRef.current;
      setSamples((previous) => [...previous, {
        timestampMs: performance.now(),
        poseVisible: current.poseVisible,
        fullBodyVisible: current.fullBodyVisible,
        luminance: current.luminance,
        framing: current.framing,
      }].slice(-80));
    }, 250);
    return () => window.clearInterval(timer);
  }, [active]);

  const calibrationReps = Math.max(0, measuredReps - baselineReps);
  const calibrationHoldSeconds = Math.max(0, measuredHoldSeconds - baselineHoldSeconds);
  const evaluation = useMemo(() => evaluateAdaptiveCameraSetup({
    exerciseId,
    samples,
    calibrationReps,
    calibrationHoldSeconds,
  }), [calibrationHoldSeconds, calibrationReps, exerciseId, samples]);

  function begin() {
    setBaselineReps(measuredReps);
    setBaselineHoldSeconds(measuredHoldSeconds);
    setSamples([]);
    setSavedProfile(null);
    setActive(true);
    onBegin();
  }

  function cancel() {
    setActive(false);
    setSamples([]);
    onCancel();
  }

  function finish() {
    const profile = createSavedCameraSetupProfile({
      id: `camera-setup-${crypto.randomUUID()}`,
      environment: selectedEnvironment,
      exerciseId,
      resolution,
      evaluation,
      samples,
      calibratedAt: new Date().toISOString(),
    });
    if (!profile) return;
    saveProfile(profile);
    setSavedProfile(profile);
    setActive(false);
    onFinish(profile);
  }

  return (
    <section className="p100-adaptive-camera" data-ready={evaluation.ready || Boolean(savedProfile)}>
      <header>
        <div>
          <span><Camera /> Adaptiv kamerauppställning</span>
          <strong>{requirement.preferredStance === "diagonal" ? "Ställ dig snett eller i profil" : "Ställ dig framifrån eller lätt snett"}</strong>
          <small>{requirement.reason}</small>
        </div>
        {savedProfile ? <em><CheckCircle2 /> Sparad · repräkning</em> : active ? <em>{Math.min(100, evaluation.usableSamplePercent)}% stabil bild</em> : null}
      </header>

      <div className="p100-adaptive-camera-environment">
        <label>
          <span>Miljö</span>
          <select
            value={selectedEnvironment}
            disabled={active || environmentLocked}
            onChange={(event) => setSelectedEnvironment(event.target.value as TrainingEnvironment)}
          >
            <option value="home">Hemma</option>
            <option value="outdoor_gym">Utegym</option>
            <option value="grass">Gräsmatta</option>
            <option value="forest">Skog</option>
            <option value="gym">Gym</option>
            <option value="other">Annan plats</option>
          </select>
        </label>
        <p>{cameraEnvironmentAdvice(selectedEnvironment)}</p>
      </div>

      {!active && !savedProfile ? (
        <button type="button" disabled={!isLive} onClick={begin}>
          <Camera /> {isLive ? "Starta 5-sekunderstest" : "Starta kameran först"}
        </button>
      ) : active ? (
        <div className="p100-adaptive-camera-live">
          <div>
            <span>Stabil bild</span><strong>{evaluation.stableSeconds.toFixed(1)} / {requirement.minStableSeconds} sek</strong>
          </div>
          <div>
            <span>Kalibrering</span>
            <strong>{requirement.minCalibrationReps > 0
              ? `${calibrationReps} / ${requirement.minCalibrationReps} reps`
              : `${Math.floor(calibrationHoldSeconds)} / ${requirement.minCalibrationHoldSeconds} sek`}</strong>
          </div>
          <p data-ready={evaluation.ready}>{evaluation.ready ? <CheckCircle2 /> : <ShieldAlert />}{evaluation.advice}</p>
          <div className="p100-adaptive-camera-actions">
            <button type="button" onClick={cancel}>Avbryt</button>
            <button type="button" disabled={!evaluation.ready} onClick={finish}><CheckCircle2 /> Använd uppställningen</button>
          </div>
        </div>
      ) : (
        <div className="p100-adaptive-camera-saved">
          <span>{savedProfile?.stance} · {savedProfile?.placement} · {savedProfile?.resolution}</span>
          <button type="button" onClick={begin}><RotateCcw /> Kalibrera igen</button>
        </div>
      )}

      <footer>{evaluation.reason}</footer>
    </section>
  );
}
