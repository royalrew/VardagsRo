"use client";

import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Info,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import React, { useState } from "react";

import type { PushupTrackerState } from "@/lib/motion-exercises";
import { buildPushupTestReport } from "@/lib/motion-pushup-test";

export interface PushupTestBenchProps {
  pushupTracker: PushupTrackerState | null;
  isLive: boolean;
  trackingEnabled: boolean;
  poseVisible: boolean;
  onStartCamera: () => void | Promise<void>;
  onToggleTracking: () => void;
  onResetTracking: () => void;
}

export function PushupTestBench({
  pushupTracker,
  isLive,
  trackingEnabled,
  poseVisible,
  onStartCamera,
  onToggleTracking,
  onResetTracking,
}: PushupTestBenchProps) {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  const reps = pushupTracker?.reps ?? 0;
  const elbowAngle = pushupTracker?.elbowAngle ?? 180;
  const bodyLine = pushupTracker?.bodyAlignmentDeg ?? 180;
  const phase = pushupTracker?.phase ?? "plank-top";
  const repsHistory = pushupTracker?.repsHistory ?? [];
  const side = pushupTracker?.side ?? "left";

  const isBottom = elbowAngle <= 95;
  const isTop = elbowAngle >= 150;
  const isBodyGood = bodyLine >= 145;

  const phaseLabel =
    phase === "plank-top"
      ? "Plankposition / Toppläge"
      : phase === "descending"
      ? "Sänker ner"
      : phase === "bottom"
      ? "Bottenläge (Godkänt djup!)"
      : "Pressar upp";

  async function handleCopyReport() {
    if (!pushupTracker) return;
    const report = buildPushupTestReport(pushupTracker);
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
    if (!pushupTracker) return;
    const report = buildPushupTestReport(pushupTracker);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `armhavning-provrapport-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="p100-pushup-test-bench" aria-label="Armhävnings Provbänk">
      {/* 1. Header & Main Trigger */}
      <div className="p100-testbench-header">
        <div className="p100-testbench-badge">
          <Sparkles size={14} />
          <span>PROVBÄNK · FYSISK KALIBRERING</span>
        </div>
        <h2>Armhävningstest</h2>
        <p>
          Gör 5–10 repetitioner framför kameran. Klicka sedan på den stora knappen{" "}
          <strong>&quot;Kopiera provrapport&quot;</strong> och klistra in i chatten så justerar vi algoritmen!
        </p>
      </div>

      {/* 2. Big Action Controls */}
      <div className="p100-testbench-actions">
        {!isLive ? (
          <button
            type="button"
            className="p100-testbench-big-btn"
            onClick={() => void onStartCamera()}
          >
            <Camera size={20} />
            <span>Starta kamera & armhävningstest</span>
          </button>
        ) : !trackingEnabled ? (
          <button
            type="button"
            className="p100-testbench-big-btn ready"
            onClick={onToggleTracking}
            disabled={!poseVisible}
          >
            <Zap size={20} />
            <span>{poseVisible ? "Starta mätning nu" : "Ställ dig i bild för att starta"}</span>
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
              onClick={onResetTracking}
              title="Nollställ räknaren och börja om från 0"
            >
              <RotateCcw size={16} />
              <span>Nollställ test</span>
            </button>

            <button
              type="button"
              className="p100-testbench-secondary-btn"
              onClick={handleDownloadReport}
              title="Ladda ned provrapporten som en .json-fil"
            >
              <Download size={16} />
              <span>Ladda ned .json</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Live Telemetry HUD */}
      {isLive && trackingEnabled ? (
        <div className="p100-testbench-telemetry">
          <div className="p100-telemetry-item reps">
            <span className="label">RÄKNADE REPS</span>
            <span className="value">{reps}</span>
            <span className="sub">godkända</span>
          </div>

          <div className={`p100-telemetry-item elbow ${isBottom ? "good" : isTop ? "top" : "mid"}`}>
            <span className="label">ARMBÅGSVINKEL</span>
            <span className="value">{elbowAngle}°</span>
            <span className="sub">{isBottom ? "Godkänt bottenläge (≤ 95°)" : isTop ? "Lockout (≥ 150°)" : "Böj under 95°"}</span>
          </div>

          <div className={`p100-telemetry-item body ${isBodyGood ? "good" : "warning"}`}>
            <span className="label">BÅLLINJE</span>
            <span className="value">{bodyLine}°</span>
            <span className="sub">{isBodyGood ? "Rak planka" : "Lyft höften / spänn bålen"}</span>
          </div>

          <div className="p100-telemetry-item phase">
            <span className="label">FAS & KAMERASIDA</span>
            <span className="value-sm">{phaseLabel}</span>
            <span className="sub">Kamera ser: {side === "left" ? "Vänster sida" : "Höger sida"}</span>
          </div>
        </div>
      ) : null}

      {/* 4. Instructions & Angle Guidance */}
      <div className="p100-testbench-instructions-card">
        <button
          type="button"
          className="p100-instructions-toggle"
          onClick={() => setShowInstructions((prev) => !prev)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Info size={16} style={{ color: "#38bdf8" }} />
            <strong>Instruktioner för vinklar & kameraplacering</strong>
          </div>
          {showInstructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showInstructions ? (
          <div className="p100-instructions-content">
            <div className="p100-instruction-row">
              <div className="step-num">1</div>
              <div>
                <strong>📐 Kameravinkel & Höjd (Profil)</strong>
                <p>
                  Placera mobilen eller datorn <strong>från sidan (profil)</strong> ca 40–70 cm från golvet
                  (t.ex. på en stol eller en hög böcker). Undvik att ha kameran platt på golvet pekande uppåt.
                </p>
              </div>
            </div>

            <div className="step-num-divider" />

            <div className="p100-instruction-row">
              <div className="step-num">2</div>
              <div>
                <strong>📏 Avstånd (Helkropp)</strong>
                <p>
                  Backa <strong>2.0 till 2.5 meter</strong> så att hela kroppen (från huvud och armbågar till höft och fötter)
                  syns i bild genom hela rörelsen.
                </p>
              </div>
            </div>

            <div className="step-num-divider" />

            <div className="p100-instruction-row">
              <div className="step-num">3</div>
              <div>
                <strong>🎯 Vinkelkrav & Repetition</strong>
                <ul>
                  <li><strong>Bottenläge:</strong> Bröstet sänks tills armbågen böjs under <strong>95°</strong>.</li>
                  <li><strong>Toppläge:</strong> Pressa upp hela vägen till rak arm (<strong>≥ 150°</strong>).</li>
                  <li><strong>Bål:</strong> Håll kroppen rak som en planka (<strong>≥ 145°</strong>).</li>
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 5. Reps History Log */}
      {repsHistory.length > 0 ? (
        <div className="p100-testbench-history">
          <h4>Registrerade repetitioner ({repsHistory.length})</h4>
          <div className="p100-testbench-reps-list">
            {repsHistory.map((rep) => (
              <div key={rep.repNumber} className="p100-testbench-rep-pill">
                <span className="rep-no">Rep {rep.repNumber}</span>
                <span className="rep-deg">Min vinkel: {rep.minElbowAngle}°</span>
                <span className="rep-dur">{(rep.durationMs / 1000).toFixed(1)}s</span>
                {rep.minElbowAngle <= 95 ? (
                  <CheckCircle2 size={14} style={{ color: "#34d399" }} />
                ) : (
                  <AlertCircle size={14} style={{ color: "#f87171" }} />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
