"use client";

import { ExternalLink, MessageCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui";
import type { DashboardData, FamilyPerson } from "@/lib/types";

export interface PersonDraft {
  name: string;
  role: string;
  personType: "adult" | "child";
  aliases: string[];
}

interface EditorState {
  person: FamilyPerson | null;
  name: string;
  role: string;
  personType: "adult" | "child";
  aliasText: string;
}

interface TelegramAccountView {
  personId: string;
  personName: string;
  displayName: string;
  username: string | null;
}

interface TelegramLinkState {
  configured: boolean;
  botUsername: string | null;
  accounts: TelegramAccountView[];
}

/** Split the free-text alias field on commas, keeping what the family typed. */
export function parseAliases(value: string): string[] {
  return value
    .split(",")
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}

function emptyEditor(): EditorState {
  return { person: null, name: "", role: "", personType: "adult", aliasText: "" };
}

function editorFor(person: FamilyPerson): EditorState {
  return {
    person,
    name: person.name,
    role: person.role,
    personType: person.personType,
    aliasText: person.aliases.join(", "),
  };
}

export function FamilySettingsModal({
  open,
  data,
  onClose,
  onSaveFamilyName,
  onCreatePerson,
  onUpdatePerson,
  onDeletePerson,
}: {
  open: boolean;
  data: DashboardData;
  onClose: () => void;
  onSaveFamilyName: (name: string) => Promise<boolean>;
  onCreatePerson: (draft: PersonDraft) => Promise<boolean>;
  onUpdatePerson: (person: FamilyPerson, draft: PersonDraft) => Promise<boolean>;
  onDeletePerson: (person: FamilyPerson) => Promise<boolean>;
}) {
  const [familyName, setFamilyName] = useState(data.familyName);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [telegram, setTelegram] = useState<TelegramLinkState | null>(null);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramPersonId, setTelegramPersonId] = useState("");
  const [telegramError, setTelegramError] = useState("");
  const adults = useMemo(
    () => data.people.filter((person) => person.personType === "adult"),
    [data.people],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetch("/api/telegram/link", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Kunde inte läsa Telegram-kopplingarna.");
        return (await response.json()) as TelegramLinkState;
      })
      .then((next) => {
        if (!active) return;
        setTelegram(next);
        setTelegramPersonId((current) => current || adults[0]?.id || "");
      })
      .catch((error: unknown) => {
        if (active) setTelegramError(error instanceof Error ? error.message : "Något gick fel.");
      });
    return () => {
      active = false;
    };
  }, [open, adults]);

  if (!open) return null;

  const nameChanged = familyName.trim() !== data.familyName && familyName.trim().length > 0;

  async function saveFamilyName() {
    setBusy(true);
    const saved = await onSaveFamilyName(familyName.trim());
    setBusy(false);
    if (!saved) setFamilyName(data.familyName);
  }

  async function savePerson(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!editor) return;
    const draft: PersonDraft = {
      name: editor.name.trim(),
      role: editor.role.trim(),
      personType: editor.personType,
      aliases: parseAliases(editor.aliasText),
    };
    if (!draft.name || !draft.role) return;

    setBusy(true);
    const saved = editor.person
      ? await onUpdatePerson(editor.person, draft)
      : await onCreatePerson(draft);
    setBusy(false);
    if (saved) setEditor(null);
  }

  async function deletePerson(person: FamilyPerson) {
    setBusy(true);
    const removed = await onDeletePerson(person);
    setBusy(false);
    if (removed) setConfirmDelete(null);
  }

  async function linkTelegram() {
    setBusy(true);
    setTelegramError("");
    try {
      const response = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: telegramCode, personId: telegramPersonId }),
      });
      const body = (await response.json()) as { account?: TelegramAccountView; error?: string };
      if (!response.ok || !body.account) throw new Error(body.error || "Kopplingen misslyckades.");
      setTelegram((current) =>
        current
          ? {
              ...current,
              accounts: [
                ...current.accounts.filter((item) => item.personId !== body.account!.personId),
                body.account!,
              ],
            }
          : current,
      );
      setTelegramCode("");
    } catch (error) {
      setTelegramError(error instanceof Error ? error.message : "Kopplingen misslyckades.");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkTelegram(personId: string) {
    setBusy(true);
    setTelegramError("");
    try {
      const response = await fetch("/api/telegram/link", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "Kopplingen kunde inte tas bort.");
      }
      setTelegram((current) =>
        current ? { ...current, accounts: current.accounts.filter((item) => item.personId !== personId) } : current,
      );
    } catch (error) {
      setTelegramError(error instanceof Error ? error.message : "Kopplingen kunde inte tas bort.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop organization-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <section
        className="organization-modal card family-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-settings-title"
      >
        <header>
          <div>
            <p className="eyebrow">Familjeinst&auml;llningar</p>
            <h2 id="family-settings-title">{editor ? (editor.person ? "Ändra familjemedlem" : "Ny familjemedlem") : "Er familj"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Stäng">
            <X size={19} />
          </button>
        </header>

        {editor ? (
          <form onSubmit={(event) => void savePerson(event)}>
            <label>
              <span>Namn</span>
              <input
                autoFocus
                value={editor.name}
                maxLength={60}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </label>
            <label>
              <span>Roll</span>
              <input
                value={editor.role}
                maxLength={40}
                placeholder="Pappa, Storasyster, Jag …"
                onChange={(event) => setEditor({ ...editor, role: event.target.value })}
              />
            </label>
            <label>
              <span>Persontyp</span>
              <select
                value={editor.personType}
                onChange={(event) =>
                  setEditor({ ...editor, personType: event.target.value as "adult" | "child" })
                }
              >
                <option value="adult">Vuxen</option>
                <option value="child">Barn</option>
              </select>
            </label>
            <label>
              <span>Smeknamn</span>
              <input
                value={editor.aliasText}
                placeholder="Kalle, Karl-Erik"
                onChange={(event) => setEditor({ ...editor, aliasText: event.target.value })}
              />
            </label>
            <p className="family-settings-hint">
              Smeknamn separeras med komma. De används för att hitta rätt person när ett
              dokument stavar namnet annorlunda. Persontypen avgör bland annat vilka som kan
              kopplas till Telegram.
            </p>
            <footer>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setEditor(null)}
                disabled={busy}
              >
                Avbryt
              </button>
              <button
                className="button button-primary"
                disabled={busy || !editor.name.trim() || !editor.role.trim()}
              >
                {busy ? "Sparar…" : "Spara"}
              </button>
            </footer>
          </form>
        ) : (
          <div className="family-settings-body">
            <label className="family-name-field">
              <span>Familjens namn</span>
              <div>
                <input
                  value={familyName}
                  maxLength={80}
                  onChange={(event) => setFamilyName(event.target.value)}
                />
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void saveFamilyName()}
                  disabled={busy || !nameChanged}
                >
                  Spara
                </button>
              </div>
            </label>

            <div className="family-members">
              <div className="family-members-heading">
                <p className="eyebrow">Familjemedlemmar</p>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setEditor(emptyEditor())}
                  disabled={busy}
                >
                  <Plus size={16} /> Lägg till
                </button>
              </div>

              {data.people.length === 0 ? (
                <p className="family-settings-hint">
                  Ingen är tillagd än. Lägg till er själva så börjar kalendern och
                  frågorna fungera.
                </p>
              ) : (
                <ul>
                  {data.people.map((person) => (
                    <li key={person.id}>
                      <Avatar person={person} />
                      <span className="family-member-name">
                        <strong>{person.name}</strong>
                        <small>
                          {person.role} · {person.personType === "adult" ? "Vuxen" : "Barn"}
                          {person.aliases.length ? ` · ${person.aliases.join(", ")}` : ""}
                        </small>
                      </span>
                      {confirmDelete === person.id ? (
                        <span className="family-member-confirm">
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => setConfirmDelete(null)}
                            disabled={busy}
                          >
                            Avbryt
                          </button>
                          <button
                            type="button"
                            className="button button-danger-soft"
                            onClick={() => void deletePerson(person)}
                            disabled={busy}
                          >
                            {busy ? "Tar bort…" : "Ta bort"}
                          </button>
                        </span>
                      ) : (
                        <span className="family-member-actions">
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => setEditor(editorFor(person))}
                            disabled={busy}
                            aria-label={`Ändra ${person.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => setConfirmDelete(person.id)}
                            disabled={busy}
                            aria-label={`Ta bort ${person.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="telegram-settings">
              <div className="family-members-heading">
                <p className="eyebrow"><MessageCircle size={15} /> Telegram</p>
                {telegram?.botUsername ? (
                  <a
                    className="button button-ghost"
                    href={`https://t.me/${telegram.botUsername}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Öppna botten <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>

              {telegram && !telegram.configured ? (
                <p className="family-settings-hint">Telegram är inte konfigurerat på servern ännu.</p>
              ) : (
                <>
                  <p className="family-settings-hint">
                    Skriv <strong>/start</strong> till botten. Ange sedan engångskoden här och välj vem du är.
                    Endast vuxna kan kopplas, och botten kan bara läsa familjens uppgifter.
                  </p>
                  <div className="telegram-link-form">
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={10}
                      placeholder="8-siffrig kod"
                      value={telegramCode}
                      onChange={(event) => setTelegramCode(event.target.value)}
                      aria-label="Engångskod från Telegram"
                    />
                    <select
                      value={telegramPersonId}
                      onChange={(event) => setTelegramPersonId(event.target.value)}
                      aria-label="Koppla Telegram till"
                    >
                      {adults.map((person) => (
                        <option key={person.id} value={person.id}>{person.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy || !/^\s*\d(?:[\s-]*\d){7}\s*$/.test(telegramCode) || !telegramPersonId}
                      onClick={() => void linkTelegram()}
                    >
                      Koppla
                    </button>
                  </div>
                  {telegramError ? <p className="telegram-error" role="alert">{telegramError}</p> : null}
                  {telegram?.accounts.length ? (
                    <ul className="telegram-links">
                      {telegram.accounts.map((account) => (
                        <li key={account.personId}>
                          <span><strong>{account.personName}</strong><small>{account.username ? `@${account.username}` : account.displayName}</small></span>
                          <button
                            type="button"
                            className="button button-danger-soft"
                            disabled={busy}
                            onClick={() => void unlinkTelegram(account.personId)}
                          >
                            Koppla från
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
