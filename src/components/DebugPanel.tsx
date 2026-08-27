"use client";

import { Check, Copy, Download, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { diagnosticsFilename } from "@/lib/diagnostics";
import type { DiagnosticsReport } from "@/lib/diagnostics";

/**
 * Shows an already-built report. Collecting it belongs to the caller so this
 * component never fetches or schedules anything of its own.
 */
export function DebugPanel({
  report,
  onRefresh,
  onClear,
  onClose,
}: {
  report: DiagnosticsReport;
  onRefresh: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(report, null, 2);
  const problemCount = report.events.length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = diagnosticsFilename();
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="modal-backdrop organization-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="organization-modal card debug-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="debug-title"
      >
        <header>
          <div>
            <p className="eyebrow">Fels&ouml;kning</p>
            <h2 id="debug-title">Teknisk rapport</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Stäng">
            <X size={19} />
          </button>
        </header>

        <p className="family-settings-hint">
          {problemCount === 0
            ? "Inga fel har registrerats sedan sidan laddades. Rapporten visar ändå systemets tillstånd."
            : `${problemCount} fel registrerade sedan sidan laddades.`}{" "}
          Rapporten innehåller inga namn, dokumenttitlar eller annat familjeinnehåll — bara koder,
          antal och tider.
        </p>

        <pre className="debug-json" aria-label="Felrapport som JSON">
          {json}
        </pre>

        <footer className="debug-actions">
          <button type="button" className="button button-ghost" onClick={onClear}>
            <RefreshCw size={15} /> Rensa loggen
          </button>
          <button type="button" className="button button-ghost" onClick={onRefresh}>
            Uppdatera
          </button>
          <button type="button" className="button button-ghost" onClick={download}>
            <Download size={15} /> Ladda ner .json
          </button>
          <button type="button" className="button button-primary" onClick={() => void copy()}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Kopierad" : "Kopiera"}
          </button>
        </footer>
      </section>
    </div>
  );
}
