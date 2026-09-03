"use client";

import {
  CalendarClock,
  Check,
  Flame,
  Gauge,
  Sparkles,
  Timer,
  Utensils,
  Wind,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  calculatePace,
  parseDistanceToMeters,
  parseDurationToSeconds,
} from "@/lib/project100-benchmarks";

interface RunningQuickLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayDate: string;
  onSaved?: (receipt?: string) => void;
}

const RPE_DESCRIPTIONS: Record<number, string> = {
  1: "Mycket lätt promenad",
  2: "Lätt rörelse",
  3: "Lugnt tempo",
  4: "Lätt jogging",
  5: "Bekvämt prattempo (Zon 2)",
  6: "Stadigt prattempo",
  7: "Måttligt ansträngande (Snabbdistans)",
  8: "Hård ansträngning (Tröskel/Intervaller)",
  9: "Mycket hårt (Nära max)",
  10: "Maximal ansträngning (All out)",
};

export function RunningQuickLogModal({
  isOpen,
  onClose,
  todayDate,
  onSaved,
}: RunningQuickLogModalProps) {
  const router = useRouter();

  const [title, setTitle] = useState("Löppass");
  const [sessionDate, setSessionDate] = useState(todayDate);
  const [distanceKmStr, setDistanceKmStr] = useState("5.0");
  const [timeStr, setTimeStr] = useState("30:00");
  const [effort, setEffort] = useState<number | null>(6);
  const [notes, setNotes] = useState("");

  // Post-workout protein
  const [includeProteinShake, setIncludeProteinShake] = useState(false);
  const [proteinGrams, setProteinGrams] = useState(35);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live parsed calculations
  const distanceMeters = useMemo(
    () => parseDistanceToMeters(distanceKmStr),
    [distanceKmStr],
  );
  const durationSeconds = useMemo(
    () => parseDurationToSeconds(timeStr),
    [timeStr],
  );
  const { formattedPace } = useMemo(
    () => calculatePace(distanceMeters, durationSeconds),
    [distanceMeters, durationSeconds],
  );

  if (!isOpen) return null;

  async function handleSave() {
    if (!distanceMeters || distanceMeters <= 0) {
      setError("Vänligen ange en giltig löpdistans (t.ex. 5.02 km).");
      return;
    }
    if (!durationSeconds || durationSeconds <= 0) {
      setError("Vänligen ange en giltig löptid (t.ex. 29:42 eller 30 min).");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // 1. Create completed running session
      const sessionPayload = {
        title: title.trim() || "Löppass",
        activityType: "running",
        status: "completed",
        sessionDate,
        templateId: null,
        plannedStartAt: null,
        plannedEndAt: null,
        durationSeconds,
        location: "Runkeeper",
        effort,
        bodyBefore: null,
        bodyAfter: null,
        notes: notes.trim() || null,
        exercises: [
          {
            name: "Löpning",
            notes: null,
            sets: [
              {
                target: null,
                actual: {
                  reps: null,
                  weightKg: null,
                  durationSeconds,
                  distanceMeters,
                  rpe: effort,
                },
                completed: true,
              },
            ],
          },
        ],
      };

      const res = await fetch("/api/project100/training/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Kunde inte spara löppasset.");
      }

      // 2. Optionally log protein shake
      if (includeProteinShake && proteinGrams > 0) {
        await fetch("/api/project100/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Proteinshake efter löpning",
            eatenOn: sessionDate,
            proteinG: proteinGrams,
            carbsG: 5,
            fatG: 1,
            kcal: Math.round(proteinGrams * 4 + 20),
            notes: "Snabbloggad efter passet",
          }),
        }).catch(() => null);
      }

      const kmFormatted = (distanceMeters / 1000).toFixed(2);
      const receipt = `🏃‍♂️ Loggade ${kmFormatted} km på ${formattedPace}!`;

      if (onSaved) onSaved(receipt);
      router.refresh();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod vid sparning.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="quick-run-title">
      <div className="modal-card quick-workout-card">
        <header className="modal-header">
          <div className="quick-workout-header-title">
            <span className="quick-workout-badge running-badge">
              <Wind size={16} /> Runkeeper Snabblogg
            </span>
            <h2 id="quick-run-title">Logga löppass</h2>
          </div>
          <button className="button-icon" onClick={onClose} aria-label="Stäng">
            <X size={20} />
          </button>
        </header>

        <div className="modal-body quick-workout-body">
          {error ? <div className="callout callout-error">{error}</div> : null}

          {/* Quick preset titles */}
          <div className="form-group">
            <label className="form-label">Titel på passet</label>
            <div className="quick-title-chips">
              {["Lugn löpning", "Löppass", "5 km tempo", "Intervaller", "Långpass"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`title-chip ${title === preset ? "selected" : ""}`}
                  onClick={() => setTitle(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="T.ex. Lugn morgonjogg i solen"
            />
          </div>

          {/* Distance & Time Inputs with Live Pace Display */}
          <div className="run-inputs-grid">
            <div className="form-group">
              <label className="form-label">
                Distans (km) <span className="label-hint">Från Runkeeper</span>
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-input"
                  value={distanceKmStr}
                  onChange={(e) => setDistanceKmStr(e.target.value)}
                  placeholder="5.02"
                />
                <span className="input-unit">km</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Total tid <span className="label-hint">mm:ss eller minuter</span>
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  placeholder="29:42"
                />
                <span className="input-unit"><Timer size={14} /></span>
              </div>
            </div>
          </div>

          {/* Live Pace Result Card */}
          <div className="run-pace-card">
            <div className="pace-icon-wrap">
              <Gauge size={22} />
            </div>
            <div className="pace-copy">
              <span className="pace-label">Beräknat tempo (Pace)</span>
              <span className="pace-value">{formattedPace}</span>
            </div>
          </div>

          {/* Effort / RPE */}
          <div className="form-group">
            <div className="label-with-val">
              <label className="form-label">
                <Flame size={15} /> Upplevd ansträngning (RPE 1–10)
              </label>
              {effort ? (
                <span className="rpe-val-badge">
                  RPE {effort}: {RPE_DESCRIPTIONS[effort] || ""}
                </span>
              ) : null}
            </div>
            <div className="rpe-selector">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`rpe-button rpe-${num} ${effort === num ? "selected" : ""}`}
                  onClick={() => setEffort(num)}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Notes */}
          <div className="form-group">
            <label className="form-label">Datum</label>
            <input
              type="date"
              className="form-input"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Anteckningar / Känsla (valfritt)</label>
            <input
              type="text"
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="T.ex. Lätta ben, skön runda i skogen"
            />
          </div>

          {/* Post-Workout Protein */}
          <div className="form-group post-workout-protein">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeProteinShake}
                onChange={(e) => setIncludeProteinShake(e.target.checked)}
              />
              <span className="checkbox-custom" />
              <span className="checkbox-text">
                <Utensils size={15} /> Logga proteinshake direkt efter passet (+{proteinGrams}g protein)
              </span>
            </label>
          </div>
        </div>

        <footer className="modal-footer">
          <button type="button" className="button button-ghost" onClick={onClose} disabled={isSaving}>
            Avbryt
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handleSave}
            disabled={isSaving || !distanceMeters || !durationSeconds}
          >
            {isSaving ? "Sparar..." : "Spara löppass"}
          </button>
        </footer>
      </div>
    </div>
  );
}
