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
import React, { useState } from "react";

import type { OverheadPressTrackerState } from "@/lib/motion-library";
import { buildOverheadPressTestReport } from "@/lib/motion-overhead-press-test";

export interface OverheadPressTestBenchProps {
  pressTracker: OverheadPressTrackerState | null;
  isLive: boolean;
  trackingEnabled: boolean;
  poseVisible: boolean;
  onStartCamera: () => void | Promise<void>;
  onToggleTracking: () => void;
  onResetTracking: () => void;
  onCloseTest?: () => void;
}

export function OverheadPressTestBench({
  pressTracker,
  isLive,
  trackingEnabled,
  poseVisible,
  onStartCamera,
  onToggleTracking,
  onResetTracking,
  onCloseTest,
}: OverheadPressTestBenchProps) {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  const reps = pressTracker?.reps ?? 0;
  const armAngle = pressTracker?.lastArmAngle ?? 85;
  const phase = pressTracker?.phase ?? "rack";
  const activeArm = pressTracker?.activeArm ?? "both";
  const repsHistory = pressTracker?.repsHistory ?? [];

  const isLockout = armAngle >= 148;
  const isRack = armAngle <= 100;

  const phaseLabel =
    phase === "rack"
      ? "Rackläge (vid axlar/bröst)"
      : phase === "pressing"
      ? "Pressar uppåt..."
      : "Full utlåsning (Godkänd!)";

  const armLabel =
    activeArm === "left"
      ? "Vänster arm (1 arm)"
      : activeArm === "right"
      ? "Höger arm (1 arm)"
      : "Båda armarna (2 armar / Kettlebell)";

  async function handleCopyReport() {
    if (!pressTracker) return;
    const report = buildOverheadPressTestReport(pressTracker);
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
    if (!pressTracker) return;
    const report = buildOverheadPressTestReport(pressTracker);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `axelpress-provrapport-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="p100-overhead-test-bench p100-pushup-test-bench" aria-label="Axelpress Provbänk">
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
          <span>PROVBÄNK · HANTELPRESS & KETTLEBELL</span>
        </div>
        <h2>Axelpress – Kalibrering (1 arm, 2 armar, Kettlebell)</h2>
        <p>
          Stå <strong>framifrån mot skärmen/TV:n</strong>. Kör ditt planerade test: <strong>5 med 1 arm</strong>, <strong>5 med 2 armar</strong> och <strong>5 med kettlebell från bröstet</strong>. Klicka sedan på <strong>&quot;Kopiera provrapport&quot;</strong> och klistra in i chatten.
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
            <span>Starta kamera & axelpresstest</span>
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
              <span>Nollställ</span>
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
          <span className="label">Armbågsvinkel (Lockout)</span>
          <span
            className="value"
            style={{
              color: isLockout ? "#34d399" : isRack ? "#38bdf8" : "#fbbf24",
            }}
          >
            {armAngle}°
          </span>
          <span className="sub">
            {isLockout ? "🟢 Full utlåsning (>= 148°)" : isRack ? "Rackläge vid axlar (<= 100°)" : "Pressar..."}
          </span>
        </div>

        <div className="p100-testbench-metric-card">
          <span className="label">Aktiv arm / Metod</span>
          <span className="value" style={{ fontSize: "1.15rem" }}>
            {armLabel}
          </span>
          <span className="sub">Stöder både 1 arm & 2 armar</span>
        </div>

        <div className="p100-testbench-metric-card">
          <span className="label">Rörelsefas</span>
          <span
            className="value"
            style={{
              fontSize: "1.1rem",
              color: isLockout ? "#34d399" : "#f1f5f9",
            }}
          >
            {phaseLabel}
          </span>
          <span className="sub">
            {phase === "lockout" ? "Sänk kontrollerat till axelhöjd" : "Pressa rakt upp"}
          </span>
        </div>
      </div>

      {/* 4. Instructions Accordion */}
      <div className="p100-testbench-accordion">
        <button
          type="button"
          className="p100-accordion-header"
          onClick={() => setShowInstructions((prev) => !prev)}
        >
          <div className="title">
            <Info size={16} />
            <span>Instruktioner & kamerahöjd</span>
          </div>
          {showInstructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showInstructions ? (
          <div className="p100-accordion-content">
            <ul>
              <li>
                <strong>Kameravinkel:</strong> Rakt framifrån mot TV:n. Du kan titta rakt på skärmen genom hela passet.
              </li>
              <li>
                <strong>Takhöjd / Bildutsnitt:</strong> Kontrollera att dina händer ryms i kamerans bild när du sträcker ut armarna hela vägen upp över huvudet. Backa ca 2.2–2.8 meter vid behov.
              </li>
              <li>
                <strong>1-arms press:</strong> Pressa en arm i taget. Trackern känner automatiskt av vilken arm som rör sig uppåt och isolerar dess vinkel.
              </li>
              <li>
                <strong>2-arms & Kettlebell:</strong> Pressa båda händerna uppåt samtidigt. Trackern mäter båda armarnas utlåsning.
              </li>
              <li>
                <strong>Godkänd repetition:</strong> Pressa till full sträckning (&gt;= 148°) ovanför huvudet och sänk tillbaka ner till axel- eller brösthöjd.
              </li>
            </ul>
          </div>
        ) : null}
      </div>

      {/* 5. Repetitions Log Table */}
      {repsHistory.length > 0 ? (
        <div className="p100-testbench-reps-table">
          <h3>Loggade repetitioner ({repsHistory.length} st)</h3>
          <table>
            <thead>
              <tr>
                <th>Rep #</th>
                <th>Arm / Metod</th>
                <th>Tid</th>
                <th>Lockoutvinkel</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {repsHistory.map((rep) => (
                <tr key={rep.repNumber}>
                  <td>#{rep.repNumber}</td>
                  <td>
                    {rep.arm === "left"
                      ? "Vänster arm"
                      : rep.arm === "right"
                      ? "Höger arm"
                      : "Båda armarna / KB"}
                  </td>
                  <td>{Math.round((rep.durationMs / 1000) * 10) / 10} s</td>
                  <td>
                    <span
                      style={{
                        color: rep.lockoutPassed ? "#34d399" : "#fbbf24",
                        fontWeight: 600,
                      }}
                    >
                      {rep.lockoutArmAngle}°
                    </span>
                  </td>
                  <td>
                    {rep.lockoutPassed ? (
                      <span className="badge-pass">
                        <CheckCircle2 size={14} /> Full utlåsning
                      </span>
                    ) : (
                      <span className="badge-warn">
                        <Info size={14} /> Ej full utlåsning
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
