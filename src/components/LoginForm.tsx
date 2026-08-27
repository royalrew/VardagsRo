"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    setNotice(null);
    const result = await authClient.signIn.email({ email: email.trim(), password });

    if (result.error) {
      // Deliberately the same message for a wrong address and a wrong password:
      // a login form should not reveal which accounts exist.
      setError("Fel e-postadress eller lösenord.");
      setPassword("");
      setBusy(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function requestReset() {
    if (busy) return;
    const address = email.trim();
    if (!address) {
      setError("Fyll i din e-postadress först, så skickar vi en återställningslänk.");
      return;
    }

    setBusy(true);
    setError(null);
    await authClient.requestPasswordReset({ email: address, redirectTo: "/nytt-losenord" });
    // Always the same answer, whether or not the address has an account: a login
    // form must not become a way to find out who is in the family.
    setNotice("Om adressen har ett konto är ett mejl på väg. Kolla skräpposten också.");
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <form className="login-card card" onSubmit={submit}>
        <div className="login-brand">
          <BrandMark />
        </div>
        <h1>Logga in</h1>
        <p className="login-intro">Vardagsro visar bara ditt eget hushåll.</p>

        <label className="login-field">
          <span>E-postadress</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </label>

        <label className="login-field">
          <span>Lösenord</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </label>

        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="login-notice" role="status">
            {notice}
          </p>
        ) : null}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? "Loggar in…" : "Logga in"}
        </button>

        <button type="button" className="login-secondary" onClick={requestReset} disabled={busy}>
          Glömt lösenordet?
        </button>

        <p className="login-help">
          Konton skapas av hushållets ägare. Hör av dig till den som bjöd in dig om du
          inte kommer in.
        </p>
      </form>
    </main>
  );
}
