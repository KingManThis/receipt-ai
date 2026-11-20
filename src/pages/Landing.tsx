import { Link } from "react-router-dom";
import { APP_NAME } from "../config";

const features = [
  { icon: "📸", title: "Snap or upload", text: "Photograph a paper receipt or upload a PDF. Add a whole stack at once." },
  { icon: "🔎", title: "Details filled in", text: "Vendor, date, total and tax pulled from the receipt, with a suggested IRS Schedule C category." },
  { icon: "✅", title: "Review in seconds", text: "Anything hard to read is highlighted. Check it, then save." },
  { icon: "📊", title: "Tax-ready exports", text: "CSV, category totals for your tax year, and a ZIP of every receipt image." },
];

export function Landing() {
  return (
    <main>
      <section className="hero">
        <h1>Stop losing receipts.<br />Stop dreading tax time.</h1>
        <p className="lead">
          {APP_NAME} is a receipt scanner and expense tracker for freelancers and small
          businesses. Snap a photo and get a tax-ready expense report.
        </p>
        <Link to="/login?mode=signup" className="btn">Start free</Link>
        <p className="muted small-text">Free to use. No card needed.</p>
      </section>

      <section className="grid">
        {features.map((f) => (
          <article key={f.title} className="card">
            <div className="icon">{f.icon}</div>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      <footer className="footer muted">
        {APP_NAME} organizes your expenses; it does not provide tax advice.
      </footer>
    </main>
  );
}
