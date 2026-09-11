import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Flag, ShieldCheck } from "lucide-react";

import { TrainingLiveGatePanel } from "@/components/project100/TrainingLiveGatePanel";
import {
  assertProject100Adult,
  requireProject100Actor,
} from "@/server/project100";
import { loadProject100TrainingLiveGate } from "@/server/project100-training-missions";

export const metadata: Metadata = {
  title: "System & K8-verifiering · Projekt 100",
};

export default async function Project100TrainingVerificationPage() {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);

  const liveGate = await loadProject100TrainingLiveGate(actor);

  return (
    <div className="p100-verification-workspace">
      <header className="p100-page-head">
        <div style={{ marginBottom: "1rem" }}>
          <Link
            href="/projekt-100/traning"
            className="p100-link-back"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "#9dd9af",
              textDecoration: "none",
              fontSize: "0.9rem",
            }}
          >
            <ArrowLeft size={16} /> Tillbaka till Träning
          </Link>
        </div>
        <div>
          <span>
            <Flag /> Kvalitetskriterier & Systemdiagnostik
          </span>
          <h1>System & K8-verifiering</h1>
          <p>
            Denna vy samlar tekniska godkännandekriterier (K8), live-gate och systemverifiering.
            Träningsytan hålls ren från diagnostik så att vardagsträningen alltid har fullt fokus.
          </p>
        </div>
      </header>

      <main style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {/* Provbänk & Övningskalibrering */}
        <section
          style={{
            background: "rgba(56, 189, 248, 0.05)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            borderRadius: "16px",
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#38bdf8", marginBottom: "0.25rem" }}>
                <Flag size={18} />
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Fysisk Kalibrering & Provbänk</h3>
              </div>
              <p style={{ color: "#94a3b8", margin: 0, fontSize: "0.9rem" }}>
                Provkör övningar en och en med vinkelmätning och kopiera .json-rapport till AI för intrimning.
              </p>
            </div>
            <Link
              href="/projekt-100/traning/motion?exercise=bicep-curl"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "10px 18px",
                borderRadius: "10px",
                background: "#7c3aed",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.9rem",
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(124, 58, 237, 0.35)",
              }}
            >
              Starta Bicepscurltest →
            </Link>
          </div>
        </section>

        {/* K8 Live-gate panel */}
        <TrainingLiveGatePanel assessment={liveGate} />

        {/* Arkitektur och verifieringskontext */}
        <section
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1rem",
              color: "#9dd9af",
            }}
          >
            <ShieldCheck size={20} />
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>K8 Godkännandekriterier (Etapp U0)</h3>
          </div>
          <p style={{ color: "#a5b4a9", lineHeight: 1.6, fontSize: "0.95rem" }}>
            Enligt <code>PLAN_TRANINGSUPPLEVELSE.md</code> (Etapp U0) är acceptanskriterierna
            avgränsade så att tekniska provvillkor inte ställs som krav vid det ordinarie första
            besöket i träningsstudion. Verifiering sker genom att logga faktiska pass i respektive
            miljö utan att skriva om historik eller använda fejkade progressionsvärden.
          </p>
        </section>
      </main>
    </div>
  );
}
