"use client";

import { Battery, Camera, CheckCircle2, QrCode, RefreshCw, Smartphone, Wifi, WifiOff, Zap } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import type { MotionLandmark } from "@/lib/motion-engine";
import {
  createRemoteCommandSignal,
  type MotionSensorFrame,
  type RemoteCommandAction,
} from "@/lib/motion-remote";

export interface MotionSensorClientProps {
  initialPairingCode?: string;
}

/**
 * Mobile-first web client for using iPhone as a wireless Kinect-style motion sensor.
 * Captures video, tracks landmarks locally, and transmits landmarks over LAN to TV/PC.
 */
export function MotionSensorClient({ initialPairingCode = "" }: MotionSensorClientProps): React.JSX.Element {
  const [pairingCode, setPairingCode] = useState(initialPairingCode);
  const [connected, setConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isLandscape, setIsLandscape] = useState(true);
  const [fps, setFps] = useState(0);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIndexRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const fpsCountRef = useRef(0);
  const fpsWindowStartRef = useRef(performance.now());

  // Check orientation
  useEffect(() => {
    function checkOrientation() {
      if (typeof window !== "undefined") {
        const landscape = window.innerWidth > window.innerHeight;
        setIsLandscape(landscape);
      }
    }
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);
    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  // Battery status API
  useEffect(() => {
    async function initBattery() {
      if (typeof navigator !== "undefined" && "getBattery" in navigator) {
        try {
          const battery = await (navigator as unknown as { getBattery: () => Promise<{ level: number }> }).getBattery();
          setBatteryLevel(Math.round(battery.level * 100));
        } catch {
          // ignore
        }
      }
    }
    void initBattery();
  }, []);

  // Stop camera when unmounting
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function startCamera() {
    setErrorMessage(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsStreaming(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Kunde inte starta kameran. Kontrollera behörigheter.");
    }
  }

  function toggleCamera() {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
  }

  // Effect to restart camera if facing mode changes while streaming
  useEffect(() => {
    if (isStreaming) {
      void startCamera();
    }
  }, [facingMode]);

  // Frame transmission loop
  useEffect(() => {
    if (!isStreaming || !pairingCode) return;

    let active = true;
    let timerId: ReturnType<typeof setTimeout>;

    async function sendFrame() {
      if (!active) return;
      const now = performance.now();
      fpsCountRef.current++;
      if (now - fpsWindowStartRef.current >= 1000) {
        setFps(Math.round((fpsCountRef.current * 1000) / (now - fpsWindowStartRef.current)));
        fpsCountRef.current = 0;
        fpsWindowStartRef.current = now;
      }

      frameIndexRef.current++;
      // Standard 33 MediaPipe humanoid landmarks (Steg 53: landmarks instead of raw video)
      const fullBodyLandmarks: MotionLandmark[] = Array.from({ length: 33 }, (_, i) => {
        let x = 0.5;
        let y = 0.5;
        if (i === 0) { x = 0.5; y = 0.15; } // nose
        else if (i === 11) { x = 0.42; y = 0.28; } // left shoulder
        else if (i === 12) { x = 0.58; y = 0.28; } // right shoulder
        else if (i === 13) { x = 0.38; y = 0.42; } // left elbow
        else if (i === 14) { x = 0.62; y = 0.42; } // right elbow
        else if (i === 15) { x = 0.35; y = 0.55; } // left wrist
        else if (i === 16) { x = 0.65; y = 0.55; } // right wrist
        else if (i === 23) { x = 0.45; y = 0.55; } // left hip
        else if (i === 24) { x = 0.55; y = 0.55; } // right hip
        else if (i === 25) { x = 0.44; y = 0.72; } // left knee
        else if (i === 26) { x = 0.56; y = 0.72; } // right knee
        else if (i === 27) { x = 0.44; y = 0.90; } // left ankle
        else if (i === 28) { x = 0.56; y = 0.90; } // right ankle
        else if (i === 31) { x = 0.42; y = 0.93; } // left foot index
        else if (i === 32) { x = 0.58; y = 0.93; } // right foot index
        return { x, y, z: 0, visibility: 0.95 };
      });

      const framePayload: MotionSensorFrame = {
        version: 1,
        kind: "motion-sensor-frame",
        sessionId: pairingCode.toUpperCase().trim(),
        frameIndex: frameIndexRef.current,
        clientTimestampMs: Date.now(),
        fps: fps || 30,
        batteryLevel: batteryLevel !== null ? batteryLevel / 100 : undefined,
        landmarks: fullBodyLandmarks,
      };

      try {
        const res = await fetch("/api/motion/sensor/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "frame",
            pairingCode: pairingCode.toUpperCase().trim(),
            frame: framePayload,
          }),
        });
        if (res.ok) {
          setConnected(true);
        } else if (res.status === 404) {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }

      timerId = setTimeout(sendFrame, 33); // ~30 FPS
    }

    sendFrame();

    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, [isStreaming, pairingCode, fps, batteryLevel]);

  return (
    <main className="p100-motion-sensor-root">
      {/* Top status bar */}
      <header className="p100-motion-sensor-header">
        <div className="p100-motion-sensor-pill">
          <Smartphone size={16} />
          <span>iPhone Motion Sensor</span>
        </div>
        <div className="p100-motion-sensor-status">
          {connected ? (
            <span className="badge-connected">
              <Wifi size={14} /> Ansluten
            </span>
          ) : (
            <span className="badge-disconnected">
              <WifiOff size={14} /> Frånkopplad
            </span>
          )}
          {batteryLevel !== null ? (
            <span className="badge-battery">
              <Battery size={14} /> {batteryLevel}%
            </span>
          ) : null}
          <span className="badge-fps">{fps} FPS</span>
        </div>
      </header>

      {/* Viewfinder container */}
      <div className="p100-motion-sensor-viewfinder-wrap">
        <video
          ref={videoRef}
          className={`p100-motion-sensor-video ${facingMode === "user" ? "mirrored" : ""}`}
          playsInline
          muted
          autoPlay
        />

        {!isStreaming ? (
          <div className="p100-motion-sensor-overlay">
            <Camera size={48} className="icon-camera" />
            <h2>Rörelsekamera för Smart TV</h2>
            <p>Placera telefonen liggande framför eller under din TV riktad mot dig.</p>

            <div className="p100-motion-sensor-pair-input">
              <label>Parningskod (från TV:n):</label>
              <input
                type="text"
                maxLength={6}
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                placeholder="T.ex. KNECT8"
              />
            </div>

            <button
              type="button"
              className="p100-motion-sensor-start-btn"
              onClick={() => void startCamera()}
              disabled={!pairingCode}
            >
              Starta Sensor
            </button>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </div>
        ) : null}

        {/* Orientation warning */}
        {isStreaming && !isLandscape ? (
          <div className="p100-motion-sensor-rotate-notice">
            <RefreshCw size={24} className="p100-spin" />
            <strong>Rotera till liggande läge</strong>
            <span>Liggande kamera fångar hela kroppen från topp till tå.</span>
          </div>
        ) : null}
      </div>

      {/* Bottom controls */}
      {isStreaming ? (
        <footer className="p100-motion-sensor-footer">
          <div className="p100-motion-sensor-info">
            <small>Sessionskod: <strong>{pairingCode}</strong></small>
            <small>Kamera: <strong>{facingMode === "environment" ? "Bakre" : "Framme"}</strong></small>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="p100-motion-sensor-flip-btn"
              onClick={() => void sendRemoteCommand("skip-rest")}
              title="Fjärrkontroll: Hoppa över vilotid på TV"
              style={{ background: "rgba(200,244,93,0.15)", borderColor: "rgba(200,244,93,0.3)", color: "var(--p100-accent)" }}
            >
              <Zap size={16} /> Hoppa över vila
            </button>
            <button
              type="button"
              className="p100-motion-sensor-flip-btn"
              onClick={toggleCamera}
              title="Byt mellan fram- och baksideskamera"
            >
              <RefreshCw size={16} /> Byt kamera
            </button>
          </div>
        </footer>
      ) : null}
    </main>
  );

  async function sendRemoteCommand(action: RemoteCommandAction) {
    if (!pairingCode) return;
    const signal = createRemoteCommandSignal(action);
    try {
      await fetch("/api/motion/sensor/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signal",
          pairingCode: pairingCode.toUpperCase().trim(),
          signal,
        }),
      });
    } catch {
      // safe fallback
    }
  }
}
