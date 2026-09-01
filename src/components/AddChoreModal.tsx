"use client";

import { Check, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/ui";
import {
  getCleaningAreaForPerson,
  KIDS_CLEANING_AREAS,
} from "@/lib/kids-chores";
import type { FamilyPerson } from "@/lib/types";

export interface ChoreItemInput {
  personId: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  kind: "other";
}

export function AddChoreModal({
  open,
  people,
  onClose,
  onSave,
}: {
  open: boolean;
  people: FamilyPerson[];
  onClose: () => void;
  onSave: (tasks: ChoreItemInput[]) => Promise<boolean>;
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
  const [selectedChores, setSelectedChores] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
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

  // Reset selected chores when opening or switching child
  useEffect(() => {
    if (!open) {
      setSelectedChores([]);
      setCustomInput("");
      setNotes("");
      setError(null);
    }
  }, [open]);

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

  function togglePreset(preset: string) {
    setSelectedChores((current) =>
      current.includes(preset)
        ? current.filter((item) => item !== preset)
        : [...current, preset],
    );
    setError(null);
  }

  function addCustomChore() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!selectedChores.includes(trimmed)) {
      setSelectedChores((current) => [...current, trimmed]);
    }
    setCustomInput("");
    setError(null);
  }

  function removeChore(titleToRemove: string) {
    setSelectedChores((current) => current.filter((item) => item !== titleToRemove));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const allTitlesToSave = [...selectedChores];
    if (customInput.trim() && !allTitlesToSave.includes(customInput.trim())) {
      allTitlesToSave.push(customInput.trim());
    }

    if (allTitlesToSave.length === 0) {
      setError("Välj minst en förvald syssla eller skriv en egen uppgift.");
      return;
    }
    if (!selectedPersonId) {
      setError("Välj vem som ska göra uppgiften.");
      return;
    }

    const dueAt = calculateDueDate(dueOption);
    const tasksToSave: ChoreItemInput[] = allTitlesToSave.map((title) => ({
      personId: selectedPersonId,
      title,
      notes: notes.trim() || null,
      dueAt,
      kind: "other",
    }));

    setBusy(true);
    setError(null);
    try {
      const ok = await onSave(tasksToSave);
      if (ok) {
        setSelectedChores([]);
        setCustomInput("");
        setNotes("");
        onClose();
      } else {
        setError("Kunde inte spara uppgifterna.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod.");
    } finally {
      setBusy(false);
    }
  }

  const totalSelected = selectedChores.length + (customInput.trim() ? 1 : 0);

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
              <h2 id="add-chore-title">Lägg till städuppgifter</h2>
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

          {/* Presets - Multi Select */}
          {cleaningArea && (
            <div className="chore-presets">
              <span className="chore-label">
                Klicka för att välja sysslor för {cleaningArea.area} (du kan välja flera):
              </span>
              <div className="chore-preset-chips">
                {cleaningArea.presetTasks.map((preset) => {
                  const isChecked = selectedChores.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      className={`chore-preset-btn ${isChecked ? "chore-preset-active" : ""}`}
                      onClick={() => togglePreset(preset)}
                    >
                      {isChecked ? <Check size={14} /> : <Plus size={14} />} {preset}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Input */}
          <div className="chore-custom-section">
            <span className="chore-label">Eller skriv egen uppgift</span>
            <div className="chore-custom-row">
              <input
                type="text"
                placeholder={
                  cleaningArea
                    ? `t.ex. Rensa skrivbordet i ${cleaningArea.area.toLowerCase()}`
                    : "Skriv vad som ska göras…"
                }
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomChore();
                  }
                }}
                disabled={busy}
              />
              <button
                type="button"
                className="button button-soft chore-add-btn"
                onClick={addCustomChore}
                disabled={!customInput.trim()}
              >
                <Plus size={16} /> Lägg till
              </button>
            </div>
          </div>

          {/* Selected Chores List */}
          {selectedChores.length > 0 && (
            <div className="chore-selected-box">
              <span className="chore-label">
                Valda uppgifter att spara ({selectedChores.length}):
              </span>
              <ul className="chore-selected-list">
                {selectedChores.map((item) => (
                  <li key={item} className="chore-selected-item">
                    <span>• {item}</span>
                    <button
                      type="button"
                      className="chore-item-remove"
                      onClick={() => removeChore(item)}
                      title="Ta bort"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
            <span>Gemensam anteckning (valfritt)</span>
            <input
              type="text"
              placeholder="t.ex. Kom ihåg under soffan och bakom dörren"
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
            <button
              type="submit"
              className="login-submit"
              disabled={busy || totalSelected === 0}
            >
              <Plus size={16} />{" "}
              {busy
                ? "Sparar…"
                : totalSelected > 1
                  ? `Spara ${totalSelected} städuppgifter`
                  : "Spara städuppgift"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
