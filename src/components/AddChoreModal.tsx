"use client";

import { Check, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/ui";
import {
  getCleaningAreaForPerson,
  KIDS_CLEANING_AREAS,
} from "@/lib/kids-chores";
import type { FamilyPerson, FamilyTask } from "@/lib/types";

export function AddChoreModal({
  open,
  people,
  onClose,
  onSave,
}: {
  open: boolean;
  people: FamilyPerson[];
  onClose: () => void;
  onSave: (task: {
    personId: string;
    title: string;
    notes: string | null;
    dueAt: string | null;
    kind: "other";
  }) => Promise<boolean>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const kids = useMemo(
    () =>
      people.filter(
        (p) => p.personType === "child" || getCleaningAreaForPerson(p) !== null,
      ),
    [people],
  );

  const [selectedPersonId, setSelectedPersonId] = useState<string>(
    () => kids[0]?.id || people[0]?.id || "",
  );
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueOption, setDueOption] = useState<"today" | "tomorrow" | "weekend" | "none">("today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPerson = people.find((p) => p.id === selectedPersonId) ?? kids[0];
  const cleaningArea = getCleaningAreaForPerson(selectedPerson);

  useEffect(() => {
    if (kids.length > 0 && (!selectedPersonId || !people.some((p) => p.id === selectedPersonId))) {
      setSelectedPersonId(kids[0].id);
    }
  }, [kids, people, selectedPersonId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function calculateDueDate(option: typeof dueOption): string | null {
    if (option === "none") return null;
    const now = new Date();
    if (option === "today") {
      now.setHours(18, 0, 0, 0);
      return now.toISOString();
    }
    if (option === "tomorrow") {
      now.setDate(now.getDate() + 1);
      now.setHours(18, 0, 0, 0);
      return now.toISOString();
    }
    if (option === "weekend") {
      // Find upcoming Saturday
      const day = now.getDay();
      const diff = (6 - day + 7) % 7 || 7;
      now.setDate(now.getDate() + diff);
      now.setHours(12, 0, 0, 0);
      return now.toISOString();
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Skriv vad som ska göras.");
      return;
    }
    if (!selectedPersonId) {
      setError("Välj vem som ska göra uppgiften.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const ok = await onSave({
        personId: selectedPersonId,
        title: trimmedTitle,
        notes: notes.trim() || null,
        dueAt: calculateDueDate(dueOption),
        kind: "other",
      });
      if (ok) {
        setTitle("");
        setNotes("");
        onClose();
      } else {
        setError("Kunde inte spara uppgiften.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!dialogRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <section
        className="modal-panel add-chore-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-chore-title"
        ref={dialogRef}
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <div>
              <p className="eyebrow"><Sparkles size={14} /> Barnens Städområden</p>
              <h2 id="add-chore-title">Lägg till städuppgift</h2>
            </div>
            <button
              type="button"
              className="icon-button modal-close"
              onClick={onClose}
              aria-label="Stäng"
              disabled={busy}
            >
              <X size={18} />
            </button>
          </div>

          {/* Child Picker */}
          <div className="chore-person-select">
            <span className="chore-label">Välj barn & städområde</span>
            <div className="chore-person-chips">
              {kids.map((kid) => {
                const area = getCleaningAreaForPerson(kid);
                const isSelected = kid.id === selectedPersonId;
                return (
                  <button
                    key={kid.id}
                    type="button"
                    className={`chore-person-chip ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      setSelectedPersonId(kid.id);
                      setError(null);
                    }}
                  >
                    <Avatar person={kid} size="small" />
                    <span className="chore-chip-text">
                      <strong>{kid.name}</strong>
                      <small>{area ? `${area.icon} ${area.area}` : "Uppgifter"}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preset Chips */}
          {cleaningArea && (
            <div className="chore-presets">
              <span className="chore-label">Färdiga förslag för {cleaningArea.area}:</span>
              <div className="chore-preset-chips">
                {cleaningArea.presetTasks.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="chore-preset-btn"
                    onClick={() => setTitle(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Title Input */}
          <label className="login-field">
            <span>Uppgift</span>
            <input
              type="text"
              placeholder={cleaningArea ? `t.ex. Dammsuga ${cleaningArea.area.toLowerCase()}` : "Vad ska göras?"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              required
            />
          </label>

          {/* Due Options */}
          <div className="chore-due-section">
            <span className="chore-label">När ska det vara klart?</span>
            <div className="chore-due-pills">
              <button
                type="button"
                className={`chore-due-pill ${dueOption === "today" ? "active" : ""}`}
                onClick={() => setDueOption("today")}
              >
                Idag
              </button>
              <button
                type="button"
                className={`chore-due-pill ${dueOption === "tomorrow" ? "active" : ""}`}
                onClick={() => setDueOption("tomorrow")}
              >
                Imorgon
              </button>
              <button
                type="button"
                className={`chore-due-pill ${dueOption === "weekend" ? "active" : ""}`}
                onClick={() => setDueOption("weekend")}
              >
                Till helgen
              </button>
              <button
                type="button"
                className={`chore-due-pill ${dueOption === "none" ? "active" : ""}`}
                onClick={() => setDueOption("none")}
              >
                Inget datum
              </button>
            </div>
          </div>

          {/* Extra Notes */}
          <label className="login-field">
            <span>Extra anteckning (valfritt)</span>
            <input
              type="text"
              placeholder="t.ex. Kom ihåg under soffan"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </label>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <div className="password-modal-actions">
            <button
              type="button"
              className="password-modal-cancel"
              onClick={onClose}
              disabled={busy}
            >
              Avbryt
            </button>
            <button type="submit" className="login-submit" disabled={busy || !title.trim()}>
              <Plus size={16} /> {busy ? "Sparar…" : "Spara städuppgift"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
