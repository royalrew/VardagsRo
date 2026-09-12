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

import type { BentOverRowTrackerState } from "@/lib/motion-library";
import { buildBentOverRowTestReport } from "@/lib/motion-bent-over-row-test";

export interface BentOverRowTestBenchProps {
  tracker: BentOverRowTrackerState | null;
  isLive: boolean;
  trackingEnabled: boolean;
  poseVisible: boolean;
  onStartCamera: () => void | Promise<void>;
  onToggleTracking: () => void;
  onResetTracking: () => void;
  onCloseTest?: () => void;
}

export function BentOverRowTestBench({
  tracker,
  isLive,
  trackingEnabled,
  poseVisible,
  onStartCamera,
  onToggleTracking,
  onResetTracking,
  onCloseTest,
}: BentOverRowTestBenchProps) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const countdownActionsRef = useRef({ onResetTracking, onToggleTracking, trackingEnabled });

  useEffect(() => {
    countdownActionsRef.current = { onResetTracking, onToggleTracking, trackingEnabled };
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
            const utterance = new SpeechSynthesisUtterance("Kör hantelrodd!");
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
  const status = tracker?.trackingStatus ?? "seeking-bottom";
  const issue = tracker?.trackingIssue;
  const phaseLabel = status === "tracking-lost"
    ? issue === "too-close"
      ? "Backa från kameran"
      : issue === "too-far"
        ? "Gå närmare kameran"
        : issue === "distance-changed"
          ? "Stå stilla och hitta bottenläget igen"
          : "Axlar, armar, höfter eller knän syns inte säkert"
    : status === "seeking-bottom"
      ? "Håll armarna raka nedåt en kort stund"
      : phase === "bottom" && tracker && !tracker.isArmedForNextRep
        ? "Sträck båda armarna och håll bottenläget"
      : phase === "contracted"
        ? "Toppläge registrerat – sänk kontrollerat"
        : phase === "rowing"
          ? "Dra hantlarna mot höfterna"
          : "Redo i bottenläget";

  async function copyReport() {
    if (!tracker) return;
    const json = JSON.stringify(buildBentOverRowTestReport(tracker), null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = json;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3_000);
  }

  function downloadReport() {
    if (!tracker) return;
    const report = buildBentOverRowTestReport(tracker);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hantelrodd-provrapport-${report.testedAt.slice(0, 19).replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="p100-bent-over-row-test-bench p100-pushup-test-bench" aria-label="Hantelrodd provbänk">
      <div className="p100-testbench-header" style={{ position: "relative" }}>
        {onCloseTest ? (
          <button
            type="button"
            onClick={onCloseTest}
            title="Stäng provbänk"
            aria-label="Stäng provbänk"
            style={{ position: "absolute", top: 0, right: 0, padding: "6px 9px", borderRadius: 8 }}
          >
            ×
          </button>
        ) : null}
        <div className="p100-testbench-badge"><Sparkles size={14} /> PROVBÄNK · HANTELRODD</div>
        <h2>Framåtlutad hantelrodd – livekalibrering</h2>
        <p>
          Stå <strong>rakt framifrån</strong>, fäll fram i höften med rak rygg och gör
          <strong> 10 tvåarmsrodd</strong>. Dra båda hantlarna mot höfterna och sträck sedan ut armarna helt.
        </p>
      </div>

      {countdown !== null ? (
        <div className="p100-testbench-countdown">
          <div className="countdown-number">{countdown}</div>
          <div>Håll bottenläget: framåtfälld, mjuka knän och raka armar.</div>
          <button type="button" className="p100-testbench-secondary-btn" onClick={() => setCountdown(null)}>Avbryt</button>
        </div>
      ) : (
        <div className="p100-testbench-actions">
          {!isLive ? (
            <button type="button" className="p100-testbench-big-btn" onClick={() => void onStartCamera()}>
              <Camera size={20} /> Starta kamera & hantelroddstest
            </button>
          ) : !trackingEnabled ? (
            <button
              type="button"
              className="p100-testbench-big-btn ready"
              onClick={() => setCountdown(5)}
              disabled={!poseVisible}
            >
              <Zap size={20} /> {poseVisible ? "Starta hantelroddstest (5 sek)" : "Ställ dig i bild för att starta"}
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
          <span className="label">Repetitioner</span><span className="value large">{reps}</span><span className="sub">Mål: 10</span>
        </div>
        <div className="p100-testbench-metric-card">
          <span className="label">Armbågsvinklar</span>
          <span className="value" style={{ fontSize: "1.2rem" }}>V {tracker?.leftElbowAngle ?? 150}° · H {tracker?.rightElbowAngle ?? 150}°</span>
          <span className="sub">Toppläge: tydligaste armen ≤ 110°</span>
        </div>
        <div className="p100-testbench-metric-card">
          <span className="label">Bålvinkel</span><span className="value">{tracker?.torsoAngle ?? 60}°</span>
          <span className="sub">{tracker?.formWarning ?? "Framåtfällning registrerad"}</span>
        </div>
        <div className="p100-testbench-metric-card">
          <span className="label">Status</span><span className="value" style={{ fontSize: "1rem" }}>{phaseLabel}</span>
          <span className="sub">{status === "tracking-lost" ? "Inga reps räknas" : "Spårning aktiv"}</span>
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
              <li>Ha hantlarna i händerna före femsekundersnedräkningen.</li>
              <li>Stå cirka 1.8–2.2 meter bort, helst rakt framifrån så att båda armarna syns hela tiden.</li>
              <li>Fäll fram i höften, håll ryggen rak och låt båda armarna hänga rakt ned.</li>
              <li>Gör 10 kontrollerade tvåarmsrodd och stå kvar när du kopierar rapporten.</li>
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
