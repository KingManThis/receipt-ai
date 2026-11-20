import { Link } from "react-router-dom";
import { APP_NAME } from "../config";
import { useAuth } from "./AuthProvider";

export function Header() {
  const { session } = useAuth();

  return (
    <header className="header no-print">
      <Link to="/" className="brand">🧾 <span className="brand-name">{APP_NAME}</span></Link>
      <nav>
        {session ? (
          <>
            <Link to="/app">Home</Link>
            <Link to="/app/receipts">Receipts</Link>
            <Link to="/app/export">Export</Link>
            <Link to="/app/settings" aria-label="Settings" title="Settings" className="icon-link">⚙︎</Link>
          </>
        ) : (
          <Link to="/login" className="btn small">Log in</Link>
        )}
      </nav>
    </header>
  );
}
