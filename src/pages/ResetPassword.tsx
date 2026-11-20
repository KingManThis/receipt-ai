import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else navigate("/app");
  }

  return (
    <main className="auth">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>Choose a new password</h1>
        <label>
          New password
          <input type="password" required minLength={8} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="alert">{error}</p>}
        <button className="btn full">Save password</button>
      </form>
    </main>
  );
}
