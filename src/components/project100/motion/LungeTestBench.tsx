"use client";

import {
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

import type { LungeTrackerState } from "@/lib/motion-exercises";
import { buildLungeTestReport } from "@/lib/motion-lunge-test";

export interface LungeTestBenchProps {
  lungeTracker: LungeTrackerState | null;
  isLive: boolean;
  trackingEnabled: boolean;
  poseVisible: boolean;
  onStartCamera: () => void | Promise<void>;
  onToggleTracking: () => void;
  onResetTracking: () => void;
  onCloseTest?: () => void;
}

export function LungeTestBench({
  lungeTracker,
  isLive,
  trackingEnabled,
  poseVisible,
  onStartCamera,
  onToggleTracking,
  onResetTracking,
  onCloseTest,
}: LungeTestBenchProps) {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  const reps = lungeTracker?.reps ?? 0;
  const kneeAngle = lungeTracker?.kneeAngle ?? 180;
  const phase = lungeTracker?.phase ?? "standing";
  const repsHistory = lungeTracker?.repsHistory ?? [];
  const leadLeg = lungeTracker?.leadLeg ?? null;

  const isBottom = kneeAngle <= 100;
  const isStanding = kneeAngle >= 155;

  const phaseLabel =
    phase === "standing"
      ? "Stående position (Toppläge)"
      : phase === "descending"
      ? "Sänker ner i utfall"
      : phase === "bottom"
      ? "Bottenläge (Godkänt djup!)"
      : "Pressar upp till stående";

  async function handleCopyReport() {
    if (!lungeTracker) return;
    const report = buildLungeTestReport(lungeTracker);
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
    if (!lungeTracker) return;
    const report = buildLungeTestReport(lungeTracker);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `utfall-provrapport-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="p100-lunge-test-bench p100-pushup-test-bench" aria-label="Utfalls Provbänk">
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
          <span>PROVBÄNK · UTFALL (SNETT MOT TV:N)</span>
        </div>
        <h2>Utfallstest – Kalibrering (Snett 30°–45°)</h2>
        <p>
          Ställ dig <strong>snett (30°–45°) mot skärmen/TV:n</strong> så att du ser skärmen bekvämt och kameran ser fram- och bakben. Gör 5–10 repetitioner (gärna växelvis höger och vänster), klicka sedan på{" "}
          <strong>&quot;Kopiera provrapport&quot;</strong> och klistra in i chatten.
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
            <span>Starta kamera & utfallstest</span>
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
          <span className="sub">Mål: 5–10 reps</span>
        </div>

        <div className="p100-testbench-metric-card">
          <span className="label">Aktivt knä (Vinkel)</span>
          <span
            className="value"
            style={{
              color: isBottom ? "#34d399" : isStanding ? "#38bdf8" : "#fbbf24",
            }}
          >
            {kneeAngle}°
          </span>
          <span className="sub">
            {isBottom ? "🟢 Godkänt djup (<= 100°)" : isStanding ? "Toppläge (>= 155°)" : "I rörelse..."}
          </span>
        </div>

        <div className="p100-testbench-metric-card">
          <span className="label">Ledande ben</span>
          <span className="value" style={{ fontSize: "1.3rem" }}>
            {leadLeg === "left" ? "Vänster" : leadLeg === "right" ? "Höger" : "—"}
          </span>
          <span className="sub">Automatisk bendsdetektering</span>
        </div>

        <div className="p100-testbench-metric-card">
          <span className="label">Rörelsefas</span>
          <span
            className="value"
            style={{
              fontSize: "1.1rem",
              color: isBottom ? "#34d399" : "#f1f5f9",
            }}
          >
            {phaseLabel}
          </span>
          <span className="sub">
            {phase === "bottom" ? "Vänd uppåt härifrån!" : "Följ rörelsen jämnt"}
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
            <span>Instruktioner för vinklar & kameraplacering</span>
          </div>
          {showInstructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showInstructions ? (
          <div className="p100-accordion-content">
            <ul>
              <li>
                <strong>Kameravinkel:</strong> Snett (30°–45°) mot skärmen. Du slipper stirra in i väggen och kan hela tiden titta bekvämt på TV:n!
              </li>
              <li>
                <strong>Höjd & Avstånd:</strong> Kameran bör stå ca 40–80 cm från golvet (t.ex. på TV-bänken eller ett bord), ca 1.8–2.5 meter bort.
              </li>
              <li>
                <strong>Godkänt djup:</strong> Sänk det bakre knät mot golvet så att det främre knät når ca 90°–100° vinkel.
              </li>
              <li>
                <strong>Full sträckning:</strong> Res dig hela vägen upp så att benen rätas ut (&gt;= 155°) för att repetitionen ska räknas.
              </li>
              <li>
                <strong>Bilateral träning:</strong> Byt gärna ben efter varje rep eller gör 5 på vänster och 5 på höger.
              </li>
            </ul>
          </div>
        ) : null}
      </div>

      {/* 5. Repetitions Log Table */}
      {repsHistory.length > 0 ? (
        <div className="p100-testbench-reps-table">
          <h3>Loggade repetitioner i testet ({repsHistory.length} st)</h3>
          <table>
            <thead>
              <tr>
                <th>Rep #</th>
                <th>Ben</th>
                <th>Tid</th>
                <th>Min vinkel (Djup)</th>
                <th>Utlåsning</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {repsHistory.map((rep) => (
                <tr key={rep.repNumber}>
                  <td>#{rep.repNumber}</td>
                  <td>{rep.leadLeg === "left" ? "Vänster" : "Höger"}</td>
                  <td>{Math.round((rep.durationMs / 1000) * 10) / 10} s</td>
                  <td>
                    <span
                      style={{
                        color: rep.depthPassed ? "#34d399" : "#fbbf24",
                        fontWeight: 600,
                      }}
                    >
                      {rep.minKneeAngle}°
                    </span>
                  </td>
                  <td>{rep.lockoutKneeAngle}°</td>
                  <td>
                    {rep.depthPassed && rep.lockoutPassed ? (
                      <span className="badge-pass">
                        <CheckCircle2 size={14} /> Godkänd
                      </span>
                    ) : (
                      <span className="badge-warn">
                        <Info size={14} /> Otillräckligt djup
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
