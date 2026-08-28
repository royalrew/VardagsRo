"use client";

import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";

const MINIMUM_LENGTH = 12;

/**
 * Changing a password from inside the app, where a person is already signed in.
 *
 * The current password is required even so. A session left open on a shared
 * family computer should not be enough to take an account over, and in a
 * household the computer is usually shared.
 */
export function ChangePasswordModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeated, setRepeated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function reset() {
    setCurrent("");
    setNext("");
    setRepeated("");
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (next.length < MINIMUM_LENGTH) {
      setError(`Det nya lösenordet behöver vara minst ${MINIMUM_LENGTH} tecken.`);
      return;
    }
    if (next !== repeated) {
      setError("De två nya lösenorden är inte lika.");
      return;
    }
    if (next === current) {
      setError("Det nya lösenordet är samma som det gamla.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      // Anything else signed in as this account is signed out. If the reason for
      // changing was that someone else had the old one, leaving their session
      // alive would defeat the change.
      revokeOtherSessions: true,
    });
    setBusy(false);

    if (result.error) {
      setError("Det nuvarande lösenordet stämmer inte.");
      setCurrent("");
      return;
    }

    reset();
    onChanged("Lösenordet är bytt. Andra inloggningar är utloggade.");
    onClose();
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
        className="modal-panel password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        ref={dialogRef}
      >
        <form onSubmit={submit}>
          <h2 id="change-password-title">Byt lösenord</h2>
          <p className="password-modal-intro">
            Minst {MINIMUM_LENGTH} tecken. Du loggas ut från andra enheter.
          </p>

          <label className="login-field">
            <span>Nuvarande lösenord</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              disabled={busy}
            />
          </label>

          <label className="login-field">
            <span>Nytt lösenord</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(event) => setNext(event.target.value)}
              disabled={busy}
            />
          </label>

          <label className="login-field">
            <span>Upprepa det nya</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={repeated}
              onChange={(event) => setRepeated(event.target.value)}
              disabled={busy}
            />
          </label>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="password-modal-actions">
            <button
              type="button"
              className="password-modal-cancel"
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={busy}
            >
              Avbryt
            </button>
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? "Byter…" : "Byt lösenord"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
