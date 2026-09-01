"use client";

import {
  CalendarClock,
  Check,
  Dumbbell,
  Flame,
  Gauge,
  Sparkles,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  PROJECT100_ACTIVITY_LABELS,
  type Project100ActivityType,
  type Project100TrainingSession,
  type Project100TrainingTemplate,
} from "@/lib/project100-training";
import type {
  Project100QuickLogInput,
  Project100QuickLogResult,
} from "@/server/project100-quick-log-schemas";

interface WorkoutQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: Project100TrainingTemplate[];
  plannedSessions?: Project100TrainingSession[];
  todayDate: string;
  onSaved?: (receipt?: string) => void;
}

export function WorkoutQuickModal({
  isOpen,
  onClose,
  templates,
  plannedSessions = [],
  todayDate,
  onSaved,
}: WorkoutQuickModalProps) {
  const router = useRouter();

  // Mode selection: planned (if available), template (if templates exist), or custom
  const hasPlanned = plannedSessions.length > 0;
  const hasTemplates = templates.length > 0;

  const [mode, setMode] = useState<"planned" | "template" | "custom">(
    hasPlanned ? "planned" : hasTemplates ? "template" : "custom",
  );

  // Planned session selection
  const [selectedPlannedId, setSelectedPlannedId] = useState<string>(
    plannedSessions[0]?.id || "",
  );

  // Template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || "",
  );

  // Custom / General session details
  const [sessionTitle, setSessionTitle] = useState<string>(() => {
    if (hasPlanned && plannedSessions[0]) return plannedSessions[0].title;
    if (hasTemplates && templates[0]) return templates[0].name;
    return "Styrkepass";
  });
  const [customActivityType, setCustomActivityType] =
    useState<Project100ActivityType>("strength_home");
  const [durationMinutes, setDurationMinutes] = useState<number>(45);

  // Followed plan / target confirmation (Defaults to FALSE: no invented reps/weights)
  const [followedPlan, setFollowedPlan] = useState<boolean>(false);

  // Workout Effort / RPE (1-10, completely separate from energy)
  const [effort, setEffort] = useState<number | null>(null);

  // Dagsform / Journal (Energy 1-5, Mood 1-5, Reflection text)
  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [reflection, setReflection] = useState<string>("");

  // Post-workout protein (Defaults to FALSE: user must actively confirm)
  const [includeProteinShake, setIncludeProteinShake] = useState<boolean>(false);
  const [proteinGrams, setProteinGrams] = useState<number>(35);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedReceipt, setSavedReceipt] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleModeChange(newMode: "planned" | "template" | "custom") {
    setMode(newMode);
    setError(null);
    if (newMode === "planned" && plannedSessions.length > 0) {
      const p = plannedSessions.find((s) => s.id === selectedPlannedId) || plannedSessions[0];
      if (p) {
        setSelectedPlannedId(p.id);
        setSessionTitle(p.title);
      }
    } else if (newMode === "template" && templates.length > 0) {
      const t = templates.find((tmpl) => tmpl.id === selectedTemplateId) || templates[0];
      if (t) {
        setSelectedTemplateId(t.id);
        setSessionTitle(t.name);
      }
    } else if (newMode === "custom") {
      setSessionTitle("Styrkepass");
    }
  }

  function handleTemplateSelect(id: string) {
    setSelectedTemplateId(id);
    const tmpl = templates.find((t) => t.id === id);
    if (tmpl) {
      setSessionTitle(tmpl.name);
    }
  }

  function handlePlannedSelect(id: string) {
    setSelectedPlannedId(id);
    const p = plannedSessions.find((s) => s.id === id);
    if (p) {
      setSessionTitle(p.title);
    }
  }

  async function handleQuickFinish(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      let workoutPayload: Project100QuickLogInput["workout"];

      if (mode === "planned") {
        if (!selectedPlannedId) {
          throw new Error("Välj ett planerat pass att klarmarkera.");
        }
        workoutPayload = {
          mode: "planned",
          plannedSessionId: selectedPlannedId,
          sessionDate: todayDate,
          durationMinutes: durationMinutes || null,
          effort,
          notes: reflection.trim() || null,
          followedPlan,
        };
      } else if (mode === "template") {
        if (!selectedTemplateId) {
          throw new Error("Välj en mall att logga passet ifrån.");
        }
        workoutPayload = {
          mode: "template",
          templateId: selectedTemplateId,
          title: sessionTitle.trim() || undefined,
          sessionDate: todayDate,
          durationMinutes: durationMinutes || null,
          effort,
          notes: reflection.trim() || null,
          followedPlan,
        };
      } else {
        if (!sessionTitle.trim()) {
          throw new Error("Ange en passtitel.");
        }
        workoutPayload = {
          mode: "custom",
          title: sessionTitle.trim(),
          activityType: customActivityType,
          sessionDate: todayDate,
          durationMinutes: durationMinutes || null,
          effort,
          notes: reflection.trim() || null,
        };
      }

      const journalPayload: Project100QuickLogInput["journal"] =
        energy !== null || mood !== null || reflection.trim().length > 0
          ? {
              energy,
              mood,
              reflection: reflection.trim() || null,
            }
          : null;

      const proteinShakePayload: Project100QuickLogInput["proteinShake"] =
        includeProteinShake && proteinGrams > 0
          ? {
              enabled: true,
              proteinG: proteinGrams,
              kcal: Math.round(proteinGrams * 4.5),
              title: "Post-workout Proteinshake",
            }
          : null;

      const payload: Project100QuickLogInput = {
        workout: workoutPayload,
        journal: journalPayload,
        proteinShake: proteinShakePayload,
      };

      const response = await fetch("/api/project100/training/quick-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          errorData?.error?.message || "Kunde inte spara snabbloggen.",
        );
      }

      const result = (await response.json()) as Project100QuickLogResult;
      setSavedReceipt(result.receipt);

      // Brief pause to show receipt before closing
      setTimeout(() => {
        onSaved?.(result.receipt);
        router.refresh();
        onClose();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod vid sparning.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="p100-modal-backdrop" onClick={onClose}>
      <div
        className="p100-quick-workout-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="p100-quick-modal-heading"
      >
        <header className="p100-quick-workout-header">
          <div className="p100-quick-workout-title">
            <span className="p100-quick-badge">
              <Zap /> Snabbspår
            </span>
            <h2 id="p100-quick-modal-heading">Avsluta & Logga Pass</h2>
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

        {error ? (
          <div className="p100-alert danger" style={{ margin: "12px 18px 0" }}>
            {error}
          </div>
        ) : null}

        {savedReceipt ? (
          <div
            className="p100-alert success"
            style={{
              margin: "12px 18px 0",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Check size={16} /> <strong>{savedReceipt}</strong>
          </div>
        ) : null}

        <form onSubmit={handleQuickFinish} className="p100-quick-workout-form">
          {/* Mode Switcher Tabs */}
          <div className="p100-quick-mode-tabs" role="tablist">
            {hasPlanned ? (
              <button
                type="button"
                className={`p100-quick-mode-tab ${mode === "planned" ? "active" : ""}`}
                onClick={() => handleModeChange("planned")}
              >
                <CalendarClock size={13} />
                Planerat ({plannedSessions.length})
              </button>
            ) : null}
            {hasTemplates ? (
              <button
                type="button"
                className={`p100-quick-mode-tab ${mode === "template" ? "active" : ""}`}
                onClick={() => handleModeChange("template")}
              >
                <Sparkles size={13} />
                Från mall
              </button>
            ) : null}
            <button
              type="button"
              className={`p100-quick-mode-tab ${mode === "custom" ? "active" : ""}`}
              onClick={() => handleModeChange("custom")}
            >
              <Dumbbell size={13} />
              Eget pass
            </button>
          </div>

          {/* 1. Träning */}
          <section className="p100-quick-section">
            <label className="p100-quick-section-title">
              <Dumbbell /> 1. Välj Pass eller Mall
            </label>

            {mode === "planned" ? (
              <div className="p100-quick-planned-list">
                {plannedSessions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`p100-quick-template-chip ${
                      selectedPlannedId === p.id ? "active" : ""
                    }`}
                    onClick={() => handlePlannedSelect(p.id)}
                  >
                    <strong>{p.title}</strong>
                    <small>
                      {p.exercises.length} övningar · {PROJECT100_ACTIVITY_LABELS[p.activityType]}
                    </small>
                  </button>
                ))}
              </div>
            ) : null}

            {mode === "template" && templates.length > 0 ? (
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
                  min="1"
                  max="300"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </div>
            </div>

            {mode === "custom" ? (
              <div className="p100-field">
                <label>Aktivitetstyp</label>
                <select
                  value={customActivityType}
                  onChange={(e) =>
                    setCustomActivityType(e.target.value as Project100ActivityType)
                  }
                >
                  <option value="strength_home">Styrka hemma</option>
                  <option value="strength_gym">Styrka gym</option>
                  <option value="running">Löpning</option>
                  <option value="cycling">Cykling</option>
                  <option value="walking">Promenad</option>
                  <option value="mobility">Rörlighet / Stretch</option>
                  <option value="other">Annat</option>
                </select>
              </div>
            ) : null}

            {mode !== "custom" ? (
              <div className="p100-quick-plan-confirmation">
                <label className="p100-checkbox-label">
                  <input
                    type="checkbox"
                    checked={followedPlan}
                    onChange={(e) => setFollowedPlan(e.target.checked)}
                  />
                  <span>Allt enligt plan (kopiera mål till resultat)</span>
                </label>
                <small className="p100-quick-hint">
                  {followedPlan
                    ? "✓ Mallens mål sätts som genomförda reps och vikter."
                    : "Passet klarmarkeras utan påhittade reps eller vikter."}
                </small>
              </div>
            ) : null}
          </section>

          {/* 2. Passets Ansträngning (RPE) */}
          <section className="p100-quick-section">
            <label className="p100-quick-section-title">
              <Gauge /> 2. Passets Ansträngning (RPE 1–10)
            </label>
            <div className="p100-quick-rpe-row">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`p100-rpe-btn ${effort === level ? "active" : ""}`}
                  onClick={() => setEffort(effort === level ? null : level)}
                >
                  {level}
                </button>
              ))}
            </div>
            <small className="p100-quick-hint">
              {effort === null
                ? "Valfritt · klicka för att sätta passets upplevda ansträngning"
                : effort >= 9
                  ? `RPE ${effort}: Maxinsats (0–1 reps i reserv)`
                  : effort >= 7
                    ? `RPE ${effort}: Tungt & intensivt (2–3 reps i reserv)`
                    : effort >= 5
                      ? `RPE ${effort}: Måttlig belastning`
                      : `RPE ${effort}: Lätt / Återhämtande`}
            </small>
          </section>

          {/* 3. Dagsform & Mående */}
          <section className="p100-quick-section">
            <label className="p100-quick-section-title">
              <Flame /> 3. Dagsform & Känsla
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
                      onClick={() => setEnergy(energy === lvl ? null : lvl)}
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
                      onClick={() => setMood(mood === lvl ? null : lvl)}
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
                placeholder="Kort dagboksreflektion (skrivs ej över vid tidigare anteckning)"
              />
            </div>
          </section>

          {/* 4. Post-workout protein */}
          <section className="p100-quick-section">
            <label className="p100-quick-section-title">
              <Utensils /> 4. Post-Workout Protein
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
                    max="150"
                    value={proteinGrams}
                    onChange={(e) => setProteinGrams(Number(e.target.value))}
                  />
                  <span>g protein (~{Math.round(proteinGrams * 4.5)} kcal)</span>
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
              disabled={isSaving || Boolean(savedReceipt)}
            >
              {isSaving ? "Sparar allt..." : "✓ Spara & Klarmarkera pass"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
