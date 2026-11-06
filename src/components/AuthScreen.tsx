import { type FormEvent, useState } from "react";
import { supabase } from "../lib/supabase.ts";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.href },
      });
      if (error) setError(error.message);
      // No session means the project requires email confirmation first.
      else if (!data.session) setNotice(`Check ${email} for a link to confirm your account.`);
    }
    setBusy(false);
  }

  const signingIn = mode === "signin";

  return (
    <main className="auth">
      <div className="slip">
        <h1>Receipt Scanner</h1>
        <p className="muted">Photograph a receipt. Get every line itemised, categorised and searchable.</p>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete={signingIn ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "One moment…" : signingIn ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          className="link"
          onClick={() => {
            setMode(signingIn ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
        >
          {signingIn ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
