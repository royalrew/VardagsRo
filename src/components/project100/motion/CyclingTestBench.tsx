"use client";

import {
  AlertCircle,
  ArrowRight,
  Bike,
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
  X,
  Zap,
} from "lucide-react";
import React, { useState } from "react";

import type { CyclingTrackerState } from "@/lib/motion-cycling";
import { buildCyclingTestReport } from "@/lib/motion-cycling-test";

export interface CyclingTestBenchProps {
  cyclingTracker: CyclingTrackerState | null;
  isLive: boolean;
  trackingEnabled: boolean;
  poseVisible: boolean;
  onStartCamera: () => void | Promise<void>;
  onToggleTracking: () => void;
  onResetTracking: () => void;
  onProceedToIntervals: () => void;
  onCloseTest?: () => void;
}

export function CyclingTestBench({
  cyclingTracker,
  isLive,
  trackingEnabled,
  poseVisible,
  onStartCamera,
  onToggleTracking,
  onResetTracking,
  onProceedToIntervals,
  onCloseTest,
}: CyclingTestBenchProps) {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  const revolutions = cyclingTracker?.revolutions ?? 0;
  const cadenceRpm = cyclingTracker?.cadenceRpm ?? null;
  const kneeAngle = cyclingTracker?.lastKneeAngle ?? 180;
  const phase = cyclingTracker?.phase ?? "seeking";
  const side = cyclingTracker?.side ?? "left";
  const minObserved = cyclingTracker?.minKneeAngleObserved ?? 180;
  const maxObserved = cyclingTracker?.maxKneeAngleObserved ?? 0;
  const rangeOfMotion = maxObserved > minObserved ? Math.round(maxObserved - minObserved) : 0;
  const revsHistory = cyclingTracker?.revolutionsHistory ?? [];

  const isFlexed = kneeAngle <= 105;
  const isExtended = kneeAngle >= 135;

  const cadenceStatus =
    cadenceRpm === null
      ? "Söker takt (trampa 2+ varv)"
      : cadenceRpm < 60
      ? "Lugn takt / Uppvärmning"
      : cadenceRpm <= 85
      ? "Perfekt uthållighetskadens"
      : "Hög kadens / Sprint";

  async function handleCopyReport() {
    if (!cyclingTracker) return;
    const report = buildCyclingTestReport(cyclingTracker);
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
      // fallback handled gracefully
    }
  }

  function handleDownloadReport() {
    if (!cyclingTracker) return;
    const report = buildCyclingTestReport(cyclingTracker);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cykeltest-rapport-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="p100-pushup-test-bench p100-cycling-test-bench" aria-label="Motionscykel Provbänk">
      {/* 1. Header & Context */}
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
            <X size={18} />
          </button>
        ) : null}

        <div className="p100-testbench-badge" style={{ background: "rgba(52, 211, 153, 0.12)", borderColor: "rgba(52, 211, 153, 0.3)", color: "#34d399" }}>
          <Bike size={14} />
          <span>PROVBÄNK · TESTA MOTIONSCYKEL</span>
        </div>
        <h2>Test & Kalibrering av Motionscykel</h2>
        <p>
          Trampa 10–20 varv framför kameran. Klicka sedan på <strong>&quot;Kopiera provrapport (.json)&quot;</strong>{" "}
          för att spara mätningen, och gå direkt vidare till 30-minuterspasset!
        </p>
      </div>

      {/* 2. Big Action Controls */}
      <div className="p100-testbench-actions">
        {!isLive ? (
          <button
            type="button"
            className="p100-testbench-big-btn"
            style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)", borderColor: "rgba(52, 211, 153, 0.4)" }}
            onClick={() => void onStartCamera()}
          >
            <Camera size={20} />
            <span>Starta kamera & cykeltest</span>
          </button>
        ) : !trackingEnabled ? (
          <button
            type="button"
            className="p100-testbench-big-btn ready"
            onClick={onToggleTracking}
            disabled={!poseVisible}
          >
            <Zap size={20} />
            <span>{poseVisible ? "Starta mätning nu" : "Sätt dig på cykeln för att starta"}</span>
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
                  ? "✅ Provrapport kopierad (.json)!"
                  : `📋 Kopiera provrapport (${revolutions} varv loggade)`}
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

      {/* 3. Fast-Forward / Gå Vidare bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          padding: "12px 16px",
          background: "rgba(56, 189, 248, 0.08)",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          borderRadius: "14px",
        }}
      >
        <div>
          <span style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            När allt är testat & inställt
          </span>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "0.95rem" }}>
            Klar med testet? Gå vidare direkt till träningspasset:
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={onProceedToIntervals}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              color: "#ffffff",
              border: "1px solid rgba(56, 189, 248, 0.5)",
              padding: "10px 18px",
              borderRadius: "10px",
              fontSize: "0.95rem",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
            }}
          >
            <Bike size={18} />
            <span>Starta 30 min Intervallpass</span>
            <ArrowRight size={16} />
          </button>

          {onCloseTest ? (
            <button
              type="button"
              onClick={onCloseTest}
              className="p100-testbench-secondary-btn"
              style={{ padding: "10px 14px" }}
              title="Avsluta testet och återgå till övningslistan"
            >
              <span>Avsluta test</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* 4. Live Telemetry HUD */}
      {isLive && trackingEnabled ? (
        <div className="p100-testbench-telemetry">
          <div className="p100-telemetry-item reps">
            <span className="label">PEDALVARV</span>
            <span className="value" style={{ color: "#34d399" }}>{revolutions}</span>
            <span className="sub">registrerade varv</span>
          </div>

          <div className="p100-telemetry-item cadence" style={{ background: cadenceRpm ? "rgba(52, 211, 153, 0.08)" : "rgba(255, 255, 255, 0.03)", borderColor: cadenceRpm ? "rgba(52, 211, 153, 0.3)" : "transparent" }}>
            <span className="label">KADENS (RPM)</span>
            <span className="value" style={{ color: cadenceRpm ? "#34d399" : "#94a3b8" }}>
              {cadenceRpm ?? "—"}
            </span>
            <span className="sub">{cadenceStatus}</span>
          </div>

          <div className={`p100-telemetry-item elbow ${isFlexed ? "good" : isExtended ? "top" : "mid"}`}>
            <span className="label">KNÄVINKEL</span>
            <span className="value">{Math.round(kneeAngle)}°</span>
            <span className="sub">
              {isFlexed ? "Böjläge (≤ 105°)" : isExtended ? "Sträckläge (≥ 135°)" : "I rörelse"}
            </span>
          </div>

          <div className="p100-telemetry-item phase">
            <span className="label">KAMERA & AMPLITUD</span>
            <span className="value-sm">
              {side === "left" ? "Vänster sida" : "Höger sida"}
            </span>
            <span className="sub">
              Amplitud: {rangeOfMotion > 0 ? `${rangeOfMotion}°` : "Mäter..."}
            </span>
          </div>
        </div>
      ) : null}

      {/* 5. Instructions & Angle Guidance */}
      <div className="p100-testbench-instructions-card">
        <button
          type="button"
          className="p100-instructions-toggle"
          onClick={() => setShowInstructions((prev) => !prev)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Info size={16} style={{ color: "#38bdf8" }} />
            <strong>Instruktioner: Kameraplacering för motionscykel</strong>
          </div>
          {showInstructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showInstructions ? (
          <div className="p100-instructions-content">
            <div className="p100-instruction-row">
              <div className="step-num">1</div>
              <div>
                <strong>🚲 Kameraplacering (Profil)</strong>
                <p>
                  Ställ mobilen eller datorn <strong>från sidan av cykeln</strong> i höjd med sadeln/vevpartiet
                  (ca 60–90 cm från golvet). Kameran ska se hela benet när pedalen är i topp och botten.
                </p>
              </div>
            </div>

            <div className="step-num-divider" />

            <div className="p100-instruction-row">
              <div className="step-num">2</div>
              <div>
                <strong>📏 Avstånd</strong>
                <p>
                  Placera kameran ca <strong>1.8 till 2.5 meter</strong> från cykeln så att du och cykelns
                  vevarmar syns i bild utan beskärning.
                </p>
              </div>
            </div>

            <div className="step-num-divider" />

            <div className="p100-instruction-row">
              <div className="step-num">3</div>
              <div>
                <strong>🎯 Tramprörelse & Kadens</strong>
                <ul>
                  <li><strong>Övre läget:</strong> Knäet böjs under <strong>105°</strong>.</li>
                  <li><strong>Nedre läget:</strong> Knäet sträcks ut över <strong>135°</strong>.</li>
                  <li><strong>Kadens:</strong> Efter 2 jämna trampvarv räknas din kadens (RPM) ut automatiskt.</li>
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 6. Recent Revolutions Log */}
      {revsHistory.length > 0 ? (
        <div className="p100-testbench-history">
          <h4>Loggade pedalvarv ({revsHistory.length})</h4>
          <div className="p100-testbench-reps-list">
            {revsHistory.slice(-12).reverse().map((rev) => (
              <div key={rev.revolutionNumber} className="p100-testbench-rep-pill">
                <span className="rep-no">Varv {rev.revolutionNumber}</span>
                <span className="rep-deg">{rev.rpm > 0 ? `${rev.rpm} RPM` : "Kalibrerar"}</span>
                <span className="rep-dur">{rev.intervalMs > 0 ? `${(rev.intervalMs / 1000).toFixed(1)}s` : "—"}</span>
                {rev.rpm >= 50 && rev.rpm <= 110 ? (
                  <CheckCircle2 size={14} style={{ color: "#34d399" }} />
                ) : (
                  <AlertCircle size={14} style={{ color: "#fbbf24" }} />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
