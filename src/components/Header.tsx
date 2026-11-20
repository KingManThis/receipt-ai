import { Link, useNavigate } from "react-router-dom";
import { APP_NAME } from "../config";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthProvider";

export function Header() {
  const { session } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <header className="header">
      <Link to="/" className="brand">🧾 {APP_NAME}</Link>
      <nav>
        {session ? (
          <>
            <Link to="/app">Dashboard</Link>
            <button className="link" onClick={signOut}>Sign out</button>
          </>
        ) : (
          <Link to="/login" className="btn small">Log in</Link>
        )}
      </nav>
    </header>
  );
}
