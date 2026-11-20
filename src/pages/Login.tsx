import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { appUrl, enabledProviders, supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../components/AuthProvider";

type Mode = "login" | "signup" | "reset";

export function Login() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    enabledProviders().then((p) => setGoogleEnabled(Boolean(p.google)));
  }, []);

  if (session) return <Navigate to="/app" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: appUrl() },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your email to confirm your account.");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: appUrl(),
        });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appUrl() },
    });
    if (error) setError(error.message);
  }

  const title = mode === "signup" ? "Create your account" : mode === "login" ? "Welcome back" : "Reset password";

  return (
    <main className="auth">
      <div className="card auth-card">
        <h1>{title}</h1>

        {!supabaseConfigured && (
          <p className="alert">Supabase isn't connected yet. Add the keys described in the README.</p>
        )}

        {mode !== "reset" && googleEnabled && (
          <>
            <button className="btn outline full" onClick={google} type="button">
              Continue with Google
            </button>
            <div className="divider"><span>or</span></div>
          </>
        )}

        <form onSubmit={onSubmit}>
          <label>
            Email
            <input type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== "reset" && (
            <label>
              Password
              <input type="password" required minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {mode === "signup" && (
            <p className="muted small-text">
              By signing up you agree to the <a href={`${import.meta.env.BASE_URL}terms.html`}>Terms</a> and{" "}
              <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy Policy</a>.
            </p>
          )}
          {error && <p className="alert">{error}</p>}
          {notice && <p className="success">{notice}</p>}
          <button className="btn full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Sign up" : mode === "login" ? "Log in" : "Send reset link"}
          </button>
        </form>

        <p className="muted switch">
          {mode === "login" && (
            <>
              No account? <button className="link" onClick={() => setMode("signup")}>Sign up</button>
              {" · "}
              <button className="link" onClick={() => setMode("reset")}>Forgot password?</button>
            </>
          )}
          {mode !== "login" && (
            <>Have an account? <button className="link" onClick={() => setMode("login")}>Log in</button></>
          )}
        </p>
      </div>
    </main>
  );
}
