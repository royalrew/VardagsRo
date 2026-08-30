"use client";

import {
  Check,
  CheckCircle2,
  Dumbbell,
  Flame,
  Plus,
  Sparkles,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import type {
  Project100TrainingSession,
  Project100TrainingTemplate,
} from "@/lib/project100-training";

interface WorkoutQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: Project100TrainingTemplate[];
  plannedSessions: Project100TrainingSession[];
  todayDate: string;
  onSaved?: () => void;
}

export function WorkoutQuickModal({
  isOpen,
  onClose,
  templates,
  plannedSessions,
  todayDate,
  onSaved,
}: WorkoutQuickModalProps) {
  const router = useRouter();

  // Selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || "",
  );
  const [sessionTitle, setSessionTitle] = useState(
    templates[0]?.name || "Styrkepass",
  );
  const [durationMinutes, setDurationMinutes] = useState(50);

  // Dagsform / Journal
  const [energy, setEnergy] = useState<number>(4);
  const [mood, setMood] = useState<number>(4);
  const [reflection, setReflection] = useState<string>("");

  // Post-workout protein
  const [includeProteinShake, setIncludeProteinShake] = useState<boolean>(true);
  const [proteinGrams, setProteinGrams] = useState<number>(35);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleTemplateSelect(id: string) {
    setSelectedTemplateId(id);
    const tmpl = templates.find((t) => t.id === id);
    if (tmpl) {
      setSessionTitle(tmpl.name);
    }
  }

  async function handleQuickFinish(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const tmpl = templates.find((t) => t.id === selectedTemplateId);

      // 1. Create completed training session
      const exercisesPayload =
        tmpl?.exercises.map((ex) => ({
          name: ex.name,
          notes: ex.notes ?? null,
          sets: ex.sets.map((s) => ({
            reps: s.target.reps ?? 10,
            weightKg: s.target.weightKg ?? 60,
            durationSeconds: s.target.durationSeconds ?? null,
            distanceMeters: s.target.distanceMeters ?? null,
            rpe: s.target.rpe ?? 7,
          })),
        })) || [];

      const sessionRes = await fetch("/api/project100/training/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: sessionTitle || "Styrkepass",
          activityType: tmpl?.activityType || "strength_home",
          status: "completed",
          sessionDate: todayDate,
          durationSeconds: durationMinutes * 60,
          effort: energy >= 4 ? 8 : 6,
          notes: reflection || null,
          templateId: selectedTemplateId || null,
          exercises: exercisesPayload,
        }),
      });

      if (!sessionRes.ok) {
        throw new Error("Kunde inte spara träningspasset.");
      }

      // 2. Save Daily Reflection & Energy in Journal
      await fetch(`/api/project100/journal/${todayDate}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          writtenOn: todayDate,
          body: reflection || null,
          energy,
          mood,
          sleepHours: null,
          excludedFromAi: false,
        }),
      });

      // 3. Save Post-workout protein if checked
      if (includeProteinShake && proteinGrams > 0) {
        await fetch("/api/project100/nutrition/meals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Post-workout Proteinshake",
            mealDate: todayDate,
            mealType: "snack",
            proteinG: proteinGrams,
            energyKcal: Math.round(proteinGrams * 4.5),
            sourceType: "manual",
          }),
        });
      }

      onSaved?.();
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="p100-modal-backdrop" onClick={onClose}>
      <div
        className="p100-quick-workout-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p100-quick-workout-header">
          <div className="p100-quick-workout-title">
            <span className="p100-quick-badge">
              <Zap /> Snabbspår
            </span>
            <h2>Avsluta & Logga Pass</h2>
          </div>
          <button
            type="button"
            className="p100-quick-close"
            onClick={onClose}
            aria-label="Stäng"
          >
            <X />
          </button>
        </header>

        {error ? <div className="p100-alert danger">{error}</div> : null}

        <form onSubmit={handleQuickFinish} className="p100-quick-workout-form">
          {/* 1. Träning */}
          <section className="p100-quick-section">
            <label className="p100-quick-section-title">
              <Dumbbell /> 1. Välj Pass eller Mall
            </label>

            {templates.length > 0 ? (
              <div className="p100-quick-templates-grid">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`p100-quick-template-chip ${
                      selectedTemplateId === t.id ? "active" : ""
                    }`}
                    onClick={() => handleTemplateSelect(t.id)}
                  >
                    <strong>{t.name}</strong>
                    <small>{t.exercises.length} övningar</small>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="p100-quick-fields-row">
              <div className="p100-field">
                <label>Passtitel</label>
                <input
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="t.ex. Överkropp A"
                  required
                />
              </div>
              <div className="p100-field p100-field-sm">
                <label>Tid (min)</label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </div>
            </div>
          </section>

          {/* 2. Dagsform & Mående */}
          <section className="p100-quick-section">
            <label className="p100-quick-section-title">
              <Flame /> 2. Dagsform & Känsla
            </label>

            <div className="p100-quick-ratings-row">
              <div className="p100-rating-group">
                <span>Energi:</span>
                <div className="p100-rating-buttons">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      className={energy === lvl ? "active" : ""}
                      onClick={() => setEnergy(lvl)}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p100-rating-group">
                <span>Humör:</span>
                <div className="p100-rating-buttons">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      className={mood === lvl ? "active" : ""}
                      onClick={() => setMood(lvl)}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p100-field">
              <input
                type="text"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Kort reflektion (t.ex. 'Bra pump i bröstet, lätt i böjen')"
              />
            </div>
          </section>

          {/* 3. Post-workout protein */}
          <section className="p100-quick-section">
            <label className="p100-quick-section-title">
              <Utensils /> 3. Post-Workout Protein
            </label>

            <div className="p100-quick-protein-toggle">
              <label className="p100-checkbox-label">
                <input
                  type="checkbox"
                  checked={includeProteinShake}
                  onChange={(e) => setIncludeProteinShake(e.target.checked)}
                />
                <span>Logga proteinshake direkt</span>
              </label>

              {includeProteinShake ? (
                <div className="p100-protein-input-wrap">
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={proteinGrams}
                    onChange={(e) => setProteinGrams(Number(e.target.value))}
                  />
                  <span>g protein</span>
                </div>
              ) : null}
            </div>
          </section>

          {/* Action buttons */}
          <footer className="p100-quick-workout-footer">
            <button
              type="button"
              className="p100-btn"
              onClick={onClose}
              disabled={isSaving}
            >
              Avbryt
            </button>
            <button
              type="submit"
              className="p100-btn p100-btn-primary p100-btn-lg"
              disabled={isSaving}
            >
              {isSaving ? "Sparar allt..." : "✓ Spara & Klarmarkera pass"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
