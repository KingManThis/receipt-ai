import { Link } from "react-router-dom";
import { PRO_FEATURES, PRO_PRICE_LABEL, STRIPE_PAYMENT_LINK } from "../config";

const FREE_FEATURES = [
  "Unlimited receipts",
  "On-device receipt scanning (photos and PDFs)",
  "Schedule C categories, 50% meals rule",
  "CSV, tax summary and ZIP exports",
  "Install on your phone like an app",
];

export function Pricing({ signedIn }: { signedIn: boolean }) {
  const proLive = Boolean(STRIPE_PAYMENT_LINK);
  return (
    <section className="section" id="pricing">
      <h2 className="section-title">Pricing</h2>
      <div className="pricing">
        <div className="card plan">
          <h3>Free</h3>
          <p className="price">$0</p>
          <ul>{FREE_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link to={signedIn ? "/app" : "/login?mode=signup"} className="btn outline full">
            {signedIn ? "You're on Free" : "Start free"}
          </Link>
        </div>
        <div className="card plan featured">
          <h3>Pro {!proLive && <span className="badge">Coming soon</span>}</h3>
          <p className="price">{PRO_PRICE_LABEL}</p>
          <ul>{PRO_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
          {proLive ? (
            <Link to={signedIn ? "/app/settings#plan" : "/login?mode=signup"} className="btn full">Upgrade to Pro</Link>
          ) : (
            <button className="btn full" disabled>Coming soon</button>
          )}
        </div>
      </div>
    </section>
  );
}
