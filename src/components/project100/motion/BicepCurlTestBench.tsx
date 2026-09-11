"use client";

import {
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Dumbbell,
  Info,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import React, { useEffect, useState } from "react";

import type { BicepCurlTrackerState } from "@/lib/motion-library";
import { buildBicepCurlTestReport } from "@/lib/motion-bicep-curl-test";

export interface BicepCurlTestBenchProps {
  curlTracker: BicepCurlTrackerState | null;
  isLive: boolean;
  trackingEnabled: boolean;
  poseVisible: boolean;
  onStartCamera: () => void | Promise<void>;
  onToggleTracking: () => void;
  onResetTracking: () => void;
  onCloseTest?: () => void;
}

export function BicepCurlTestBench({
  curlTracker,
  isLive,
  trackingEnabled,
  poseVisible,
  onStartCamera,
  onToggleTracking,
  onResetTracking,
  onCloseTest,
}: BicepCurlTestBenchProps) {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      onResetTracking();
      if (!trackingEnabled) {
        onToggleTracking();
      }
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance("Kör!");
          utterance.lang = "sv-SE";
          window.speechSynthesis.speak(utterance);
        }
      } catch {
        // ignore
      }
      return;
    }
    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window && countdown > 1) {
          const utterance = new SpeechSynthesisUtterance(String(countdown - 1));
          utterance.lang = "sv-SE";
          window.speechSynthesis.speak(utterance);
        }
      } catch {
        // ignore
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onResetTracking, onToggleTracking, trackingEnabled]);

  function handleStartCountdown() {
    setCountdown(5);
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Gör dig redo. Fem.");
        utterance.lang = "sv-SE";
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // ignore
    }
  }

  function handleSkipCountdown() {
    setCountdown(null);
    onResetTracking();
    if (!trackingEnabled) {
      onToggleTracking();
    }
  }

  function handleCancelCountdown() {
    setCountdown(null);
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
  }

  const reps = curlTracker?.reps ?? 0;
  const lastAngle = curlTracker?.lastAngle ?? 155;
  const leftAngle = curlTracker?.leftAngle ?? 155;
  const rightAngle = curlTracker?.rightAngle ?? 155;
  const phase = curlTracker?.phase ?? "extended";
  const activeArm = curlTracker?.activeArm ?? "both";
  const repsHistory = curlTracker?.repsHistory ?? [];
  const elbowSwayWarning = curlTracker?.elbowSwayWarning ?? false;

  const isContracted = phase === "contracted" || lastAngle <= 106;
  const isExtended = phase === "extended" || lastAngle >= 118;

  const phaseLabel =
    phase === "extended"
      ? "Bottenläge (Sträckt arm)"
      : phase === "flexing"
      ? "Curlar uppåt..."
      : "Toppkontraktion (Godkänd!)";

  const armLabel =
    activeArm === "left"
      ? "Vänster arm (1 arm)"
      : activeArm === "right"
      ? "Höger arm (1 arm)"
      : "Båda armarna (Simultant / Parallellt)";

  async function handleCopyReport() {
    if (!curlTracker) return;
    const report = buildBicepCurlTestReport(curlTracker);
    const jsonStr = JSON.stringify(report, null, 2);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonStr);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = jsonStr;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  }

  function handleDownloadReport() {
    if (!curlTracker) return;
    const report = buildBicepCurlTestReport(curlTracker);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bicepscurl-provrapport-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="p100-overhead-test-bench p100-pushup-test-bench" aria-label="Bicepscurl Provbänk">
      {/* 1. Header & Main Trigger */}
      <div className="p100-testbench-header" style={{ position: "relative" }}>
        {onCloseTest ? (
          <button
            type="button"
            onClick={onCloseTest}
            title="Stäng provbänk"
            aria-label="Stäng provbänk"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "8px",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        ) : null}
        <div className="p100-testbench-badge">
          <Sparkles size={14} />
          <span>PROVBÄNK · BICEPSCURL (HANTLAR)</span>
        </div>
        <h2>Bicepscurl – Kalibrering (Höger, Vänster, Båda)</h2>
        <p>
          Stå <strong>framifrån mot skärmen/kameran</strong> med hantlar i händerna. Kör testprotokollet:{" "}
          <strong>5 med höger arm</strong>, <strong>5 med vänster arm</strong> och <strong>5 med båda armarna samtidigt</strong>. Klicka sedan på <strong>&quot;Kopiera provrapport&quot;</strong> och klistra in i chatten.
        </p>
      </div>

      {/* 2. Big Action Controls */}
      <div className="p100-testbench-actions">
        {countdown !== null ? (
          <div
            className="p100-testbench-countdown-card"
            style={{
              background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(56,189,248,0.18))",
              border: "1px solid rgba(168,85,247,0.4)",
              borderRadius: "16px",
              padding: "20px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              width: "100%",
            }}
          >
            <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#f8fafc" }}>
              🚶 Inta position med hantlarna...
            </div>
            <div
              style={{
                fontSize: "4.5rem",
                fontWeight: 900,
                color: "#38bdf8",
                lineHeight: 1,
                textShadow: "0 0 35px rgba(56,189,248,0.6)",
              }}
            >
              {countdown}
            </div>
            <div style={{ fontSize: "0.88rem", color: "#94a3b8" }}>
              Ställ dig 2–2.5 meter från kameran och låt armarna hänga rakt ned längs sidan.
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
              <button
                type="button"
                className="p100-testbench-secondary-btn"
                onClick={handleSkipCountdown}
                style={{ padding: "8px 16px" }}
              >
                <span>Börja direkt (hoppa över)</span>
              </button>
              <button
                type="button"
                className="p100-testbench-secondary-btn"
                onClick={handleCancelCountdown}
                style={{ padding: "8px 16px" }}
              >
                <span>Avbryt</span>
              </button>
            </div>
          </div>
        ) : !isLive ? (
          <button
            type="button"
            className="p100-testbench-big-btn"
            onClick={() => void onStartCamera()}
          >
            <Camera size={20} />
            <span>Starta kamera & bicepscurltest</span>
          </button>
        ) : !trackingEnabled ? (
          <button
            type="button"
            className="p100-testbench-big-btn ready"
            onClick={handleStartCountdown}
            disabled={!poseVisible}
          >
            <Zap size={20} />
            <span>
              {poseVisible
                ? "Starta mätning (5s nedräkning)"
                : "Ställ dig i bild för att starta"}
            </span>
          </button>
        ) : (
          <div className="p100-testbench-running-controls">
            <button
              type="button"
              className={`p100-testbench-copy-btn ${copied ? "copied" : ""}`}
              onClick={() => void handleCopyReport()}
            >
              {copied ? <Check size={20} /> : <Copy size={20} />}
              <span>
                {copied
                  ? "✅ Provrapport kopierad till urklipp!"
                  : `📋 Kopiera provrapport (${reps} reps loggade)`}
              </span>
            </button>

            <button
              type="button"
              className="p100-testbench-secondary-btn"
              onClick={handleStartCountdown}
              title="Nollställ och kör 5s nedräkning så du hinner ställa dig på plats"
            >
              <RotateCcw size={16} />
              <span>Nollställ (5s nedräkning)</span>
            </button>

            <button
              type="button"
              className="p100-testbench-secondary-btn"
              onClick={onResetTracking}
              title="Nollställ räknaren direkt utan nedräkning"
            >
              <RotateCcw size={16} />
              <span>Direkt-nollställ</span>
            </button>

            <button
              type="button"
              className="p100-testbench-secondary-btn"
              onClick={handleDownloadReport}
              title="Ladda ned provrapport som .json fil"
            >
              <Download size={16} />
              <span>Ladda ned .json</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Live HUD Metrics Grid */}
      <div className="p100-testbench-hud-grid">
        <div className="p100-testbench-metric-card highlight">
          <span className="label">Godkända repetitioner</span>
          <span className="value large">{reps}</span>
          <span className="sub">Mål: 15 reps (5+5+5)</span>
        </div>

        <div className="p100-testbench-metric-card">
          <span className="label">Aktiv arm / Rörelse</span>
          <span
            className="value"
            style={{
              color: activeArm === "both" ? "#a855f7" : activeArm === "right" ? "#38bdf8" : "#34d399",
              fontSize: "1.25rem",
            }}
          >
            {armLabel}
          </span>
          <span className="sub">{phaseLabel}</span>
        </div>

        <div className="p100-testbench-metric-card">
          <span className="label">Vinkel Vänster / Höger</span>
          <div style={{ display: "flex", gap: "12px", alignItems: "baseline", marginTop: "4px" }}>
            <span style={{ fontSize: "1.3rem", fontWeight: 700, color: leftAngle <= 106 ? "#34d399" : leftAngle >= 118 ? "#38bdf8" : "#fbbf24" }}>
              V: {leftAngle}°
            </span>
            <span style={{ color: "#64748b" }}>|</span>
            <span style={{ fontSize: "1.3rem", fontWeight: 700, color: rightAngle <= 106 ? "#34d399" : rightAngle >= 118 ? "#38bdf8" : "#fbbf24" }}>
              H: {rightAngle}°
            </span>
          </div>
          <span className="sub">
            {isContracted ? "🟢 Toppkontraktion (<= 106°)" : isExtended ? "Bottenläge (>= 118°)" : "Curlar..."}
          </span>
        </div>

        <div className="p100-testbench-metric-card">
          <span className="label">Form & Teknik</span>
          <span
            className="value"
            style={{
              fontSize: "1.1rem",
              color: elbowSwayWarning ? "#f87171" : "#34d399",
            }}
          >
            {elbowSwayWarning ? "⚠️ Svingvarning" : "✅ Stabil position"}
          </span>
          <span className="sub">
            {elbowSwayWarning
              ? "Håll armbågarna stilla vid sidan!"
              : "Ingen sving bakåt"}
          </span>
        </div>
      </div>

      {/* 4. Live Arm Distribution Breakdown */}
      {repsHistory.length > 0 ? (
        <div style={{
          marginTop: "16px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "8px",
          background: "rgba(15, 23, 42, 0.6)",
          padding: "12px",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>Höger arm</span>
            <strong style={{ fontSize: "1.2rem", color: "#38bdf8" }}>
              {repsHistory.filter(r => r.arm === "right").length} reps
            </strong>
          </div>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>Vänster arm</span>
            <strong style={{ fontSize: "1.2rem", color: "#34d399" }}>
              {repsHistory.filter(r => r.arm === "left").length} reps
            </strong>
          </div>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>Båda armarna</span>
            <strong style={{ fontSize: "1.2rem", color: "#a855f7" }}>
              {repsHistory.filter(r => r.arm === "both").length} reps
            </strong>
          </div>
        </div>
      ) : null}

      {/* 5. Rep History List */}
      {repsHistory.length > 0 ? (
        <div className="p100-testbench-rep-feed" style={{ marginTop: "16px" }}>
          <h4 style={{ fontSize: "0.9rem", color: "#94a3b8", marginBottom: "8px" }}>
            Slutförda repetitioner i denna omgång ({repsHistory.length} st):
          </h4>
          <div className="p100-testbench-rep-list">
            {repsHistory.slice(-8).reverse().map((rep) => {
              const durationSec = Math.round((rep.durationMs / 1000) * 10) / 10;
              const armTag =
                rep.arm === "left"
                  ? "Vänster"
                  : rep.arm === "right"
                  ? "Höger"
                  : "Båda";
              const tagColor =
                rep.arm === "left"
                  ? "#34d399"
                  : rep.arm === "right"
                  ? "#38bdf8"
                  : "#a855f7";

              return (
                <div key={rep.repNumber} className="p100-testbench-rep-item">
                  <div className="rep-num">#{rep.repNumber}</div>
                  <div className="rep-arm">
                    <span style={{
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.06)",
                      color: tagColor,
                      fontWeight: 600,
                    }}>
                      {armTag}
                    </span>
                  </div>
                  <div className="rep-depth">
                    <span>Topp: {rep.minElbowAngle}°</span>
                    <span className="dot">·</span>
                    <span>Botten: {rep.extensionElbowAngle}°</span>
                  </div>
                  <div className="rep-duration">{durationSec}s</div>
                  <div className="rep-status">
                    <CheckCircle2 size={16} color="#34d399" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 6. Test Protocol Collapsible Instructions */}
      <div className="p100-testbench-instructions-toggle">
        <button
          type="button"
          onClick={() => setShowInstructions((prev) => !prev)}
        >
          <Info size={16} />
          <span>Provprotokoll: Hur du utför testet</span>
          {showInstructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {showInstructions ? (
        <div className="p100-testbench-instructions">
          <div className="instruction-step">
            <span className="step-badge">1</span>
            <div>
              <strong>Placering:</strong> Stå ca 2.0 - 2.5 meter från kameran framifrån så att överkropp, armbågar och handleder syns tydligt i bild.
            </div>
          </div>
          <div className="instruction-step">
            <span className="step-badge">2</span>
            <div>
              <strong>5 Reps Höger arm:</strong> Håll vänster arm stilla längs sidan. Curla hanteln med höger arm upp mot axeln (&lt;= 106°), sträck sedan ut armen kontrollerat i botten (&gt;= 126°).
            </div>
          </div>
          <div className="instruction-step">
            <span className="step-badge">3</span>
            <div>
              <strong>5 Reps Vänster arm:</strong> Håll höger arm stilla längs sidan. Curla hanteln med vänster arm upp mot axeln (&lt;= 106°) och sträck ut hela vägen (&gt;= 126°).
            </div>
          </div>
          <div className="instruction-step">
            <span className="step-badge">4</span>
            <div>
              <strong>5 Reps Båda armarna:</strong> Curla båda hantlarna samtidigt upp mot axlarna och sänk kontrollerat tillbaka.
            </div>
          </div>
          <div className="instruction-step">
            <span className="step-badge">5</span>
            <div>
              <strong>Kopiera rapport:</strong> Klicka på &quot;Kopiera provrapport&quot; ovan och klistra in resultatet i chatten för verifiering.
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
