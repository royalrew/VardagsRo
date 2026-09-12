"use client";

import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Info,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import type { LateralRaiseTrackerState } from "@/lib/motion-library";
import { buildLateralRaiseTestReport } from "@/lib/motion-lateral-raise-test";

export interface LateralRaiseTestBenchProps {
  tracker: LateralRaiseTrackerState | null;
  isLive: boolean;
  trackingEnabled: boolean;
  poseVisible: boolean;
  onStartCamera: () => void | Promise<void>;
  onToggleTracking: () => void;
  onResetTracking: () => void;
  onCloseTest?: () => void;
}

export function LateralRaiseTestBench({
  tracker,
  isLive,
  trackingEnabled,
  poseVisible,
  onStartCamera,
  onToggleTracking,
  onResetTracking,
  onCloseTest,
}: LateralRaiseTestBenchProps) {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownActionsRef = useRef({
    onResetTracking,
    onToggleTracking,
    trackingEnabled,
  });

  useEffect(() => {
    countdownActionsRef.current = {
      onResetTracking,
      onToggleTracking,
      trackingEnabled,
    };
  });

  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        const actions = countdownActionsRef.current;
        actions.onResetTracking();
        if (!actions.trackingEnabled) actions.onToggleTracking();
        try {
          if ("speechSynthesis" in window) {
            const utterance = new SpeechSynthesisUtterance("Kör sidolyft!");
            utterance.lang = "sv-SE";
            window.speechSynthesis.speak(utterance);
          }
        } catch {
          // Local speech feedback is optional.
        }
        return;
      }
      setCountdown(countdown - 1);
    }, 1_000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const reps = tracker?.reps ?? 0;
  const phase = tracker?.phase ?? "bottom";
  const angle = tracker?.lastAbductionAngle ?? 15;
  const activeArm = tracker?.activeArm ?? "both";
  const trackingStatus = tracker?.trackingStatus ?? "seeking-bottom";
  const trackingIssue = tracker?.trackingIssue;

  const phaseLabel = trackingStatus === "tracking-lost"
    ? trackingIssue === "too-close"
      ? "Backa från kameran"
      : trackingIssue === "too-far"
        ? "Gå närmare kameran"
        : trackingIssue === "distance-changed"
          ? "Stå stilla med armarna längs sidorna"
          : "Se till att axlar, armbågar, handleder och höfter syns"
    : trackingStatus === "seeking-bottom"
      ? "Håll båda armarna längs sidorna en kort stund"
      : phase === "peak"
        ? "Toppläge registrerat – sänk kontrollerat"
        : phase === "raising"
          ? "Lyfter mot axelhöjd"
          : "Redo i bottenläget";

  async function copyReport() {
    if (!tracker) return;
    const json = JSON.stringify(buildLateralRaiseTestReport(tracker), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 3_000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = json;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied(true);
    }
  }

  function downloadReport() {
    if (!tracker) return;
    const report = buildLateralRaiseTestReport(tracker);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sidolyft-provrapport-${report.testedAt.slice(0, 19).replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="p100-lateral-raise-test-bench p100-pushup-test-bench" aria-label="Sidolyft provbänk">
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
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.08)",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "6px 9px",
            }}
          >
            ×
          </button>
        ) : null}
        <div className="p100-testbench-badge">
          <Sparkles size={14} />
          <span>PROVBÄNK · HANTEL-SIDOLYFT</span>
        </div>
        <h2>Sidolyft – livekalibrering</h2>
        <p>
          Ha hantlarna i händerna innan start. Gör <strong>5 höger, 5 vänster och 5 med båda armarna</strong>,
          sänk kontrollerat till låren efter varje repetition och kopiera sedan JSON-rapporten.
        </p>
      </div>

      {countdown !== null ? (
        <div className="p100-testbench-countdown">
          <div className="countdown-number">{countdown}</div>
          <div>Ställ dig framifrån, 2–2.5 meter bort, med armarna längs sidorna.</div>
          <button type="button" className="p100-testbench-secondary-btn" onClick={() => setCountdown(null)}>
            Avbryt
          </button>
        </div>
      ) : (
        <div className="p100-testbench-actions">
          {!isLive ? (
            <button type="button" className="p100-testbench-big-btn" onClick={() => void onStartCamera()}>
              <Camera size={20} /> Starta kamera & sidolyftstest
            </button>
          ) : !trackingEnabled ? (
            <button
              type="button"
              className="p100-testbench-big-btn ready"
              onClick={() => setCountdown(5)}
              disabled={!poseVisible}
            >
              <Zap size={20} /> {poseVisible ? "Starta sidolyftstest (5 sek)" : "Ställ dig i bild för att starta"}
            </button>
          ) : (
            <div className="p100-testbench-running-controls">
              <button type="button" className={`p100-testbench-copy-btn ${copied ? "copied" : ""}`} onClick={() => void copyReport()}>
                {copied ? <Check size={20} /> : <Copy size={20} />}
                {copied ? "Provrapport kopierad" : `Kopiera provrapport (${reps} reps)`}
              </button>
              <button type="button" className="p100-testbench-secondary-btn" onClick={onResetTracking}>
                <RotateCcw size={16} /> Nollställ
              </button>
              <button type="button" className="p100-testbench-secondary-btn" onClick={downloadReport}>
                <Download size={16} /> Ladda ned JSON
              </button>
            </div>
          )}
        </div>
      )}

      <div className="p100-testbench-hud-grid">
        <div className="p100-testbench-metric-card highlight">
          <span className="label">Repetitioner</span>
          <span className="value large">{reps}</span>
          <span className="sub">Mål: 15 totalt</span>
        </div>
        <div className="p100-testbench-metric-card">
          <span className="label">Lyftvinkel</span>
          <span className="value">{Math.round(angle)}°</span>
          <span className="sub">Mål: 80°–105°</span>
        </div>
        <div className="p100-testbench-metric-card">
          <span className="label">Aktiv arm</span>
          <span className="value" style={{ fontSize: "1.25rem" }}>
            {activeArm === "left" ? "Vänster" : activeArm === "right" ? "Höger" : "Båda"}
          </span>
          <span className="sub">Automatisk identifiering</span>
        </div>
        <div className="p100-testbench-metric-card">
          <span className="label">Status</span>
          <span className="value" style={{ fontSize: "1rem" }}>{phaseLabel}</span>
          <span className="sub">{trackingStatus === "tracking-lost" ? "Inga reps räknas" : "Spårning aktiv"}</span>
        </div>
      </div>

      <div className="p100-testbench-accordion">
        <button type="button" className="p100-accordion-header" onClick={() => setShowInstructions((value) => !value)}>
          <div className="title"><Info size={16} /> Testinstruktioner</div>
          {showInstructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showInstructions ? (
          <div className="p100-accordion-content">
            <ul>
              <li>Kameran ska se höfter, axlar, armbågar och händer under hela lyftet.</li>
              <li>Håll en lätt armbågsböjning och lyft rakt ut åt sidan till axelhöjd.</li>
              <li>Gör 5 repetitioner med höger arm, 5 med vänster och 5 med båda samtidigt.</li>
              <li>Efter sista repetitionen: stå kvar och kopiera rapporten innan du går fram till kameran.</li>
            </ul>
          </div>
        ) : null}
      </div>

      {(tracker?.repsHistory.length ?? 0) > 0 ? (
        <div className="p100-testbench-reps-table">
          <h3>Loggade repetitioner ({tracker?.repsHistory.length})</h3>
          <table>
            <thead><tr><th>#</th><th>Arm</th><th>Tid</th><th>Topp</th><th>Status</th></tr></thead>
            <tbody>
              {tracker?.repsHistory.map((rep) => (
                <tr key={rep.repNumber}>
                  <td>#{rep.repNumber}</td>
                  <td>{rep.arm === "left" ? "Vänster" : rep.arm === "right" ? "Höger" : "Båda"}</td>
                  <td>{Math.round((rep.durationMs / 1_000) * 10) / 10} s</td>
                  <td>{rep.peakAngle}°</td>
                  <td>{rep.heightPassed && !rep.overshootWarning ? "Godkänd" : rep.overshootWarning ? "För högt" : "För lågt"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
