"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { authClient } from "@/lib/auth-client";

const MINIMUM_LENGTH = 12;

export function NewPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (!token) {
      setError("Länken saknar en giltig kod. Begär en ny återställning.");
      return;
    }
    if (password.length < MINIMUM_LENGTH) {
      setError(`Lösenordet behöver vara minst ${MINIMUM_LENGTH} tecken.`);
      return;
    }
    if (password !== repeated) {
      setError("De två lösenorden är inte lika.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword: password, token });

    if (result.error) {
      setError("Länken har gått ut eller är redan använd. Begär en ny återställning.");
      setBusy(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="login-shell">
      <form className="login-card card" onSubmit={submit}>
        <div className="login-brand">
          <BrandMark />
        </div>
        <h1>Välj ett nytt lösenord</h1>
        <p className="login-intro">Minst {MINIMUM_LENGTH} tecken.</p>

        <label className="login-field">
          <span>Nytt lösenord</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </label>

        <label className="login-field">
          <span>Upprepa lösenordet</span>
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

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? "Sparar…" : "Spara lösenordet"}
        </button>
      </form>
    </main>
  );
}
