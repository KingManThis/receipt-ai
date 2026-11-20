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
    <header className="header no-print">
      <Link to="/" className="brand">🧾 <span className="brand-name">{APP_NAME}</span></Link>
      <nav>
        {session ? (
          <>
            <Link to="/app">Home</Link>
            <Link to="/app/receipts">Receipts</Link>
            <Link to="/app/export">Export</Link>
            <button className="link" onClick={signOut}>Sign out</button>
          </>
        ) : (
          <Link to="/login" className="btn small">Log in</Link>
        )}
      </nav>
    </header>
  );
}
