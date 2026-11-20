import { Link } from "react-router-dom";
import { APP_NAME } from "../config";
import { useAuth } from "../components/AuthProvider";
import { displayName } from "../lib/greeting";

const base = import.meta.env.BASE_URL;

const features = [
  { icon: "📸", title: "Snap or upload", text: "Photograph a paper receipt or upload a PDF. Add a whole stack at once." },
  { icon: "🔎", title: "Details filled in", text: "Vendor, date, total and tax pulled from the receipt, with a suggested IRS Schedule C category." },
  { icon: "✅", title: "Review in seconds", text: "Anything hard to read is highlighted. Check it, then save." },
  { icon: "📊", title: "Tax-ready exports", text: "CSV, category totals for your tax year, and a ZIP of every receipt image." },
];

const steps = [
  { title: "Snap it", text: "Take a photo the moment you get a receipt, or forward the PDF. No more shoeboxes." },
  { title: "Check it", text: "We fill in the details and suggest a Schedule C category. Fix anything highlighted in a tap." },
  { title: "Export it", text: "At tax time, download one ZIP with every receipt, a spreadsheet and totals by category." },
];

const faqs = [
  { q: "Is it really free?", a: "Yes. Scanning, storing, reviewing and exporting receipts is free, with no card needed." },
  { q: "Can I use photos of receipts for my taxes?", a: "Readable digital copies are generally accepted as records. Each one should show who you paid, how much, when and what for. Ask your tax professional if you're unsure." },
  { q: "What are Schedule C categories?", a: "They're the expense lines on the IRS form freelancers and sole proprietors use, like Supplies, Travel and Meals. Using them all year means tax time is just adding up columns." },
  { q: "Are meals fully deductible?", a: "Business meals are generally 50% deductible. ReceiptPilot applies that automatically in your tax summary." },
  { q: "Is my data private?", a: "Receipts are read on your own device, then stored in a private account only you can access. You can export or delete everything at any time." },
  { q: "Does it work on my phone?", a: "Yes. It works in any browser, and you can add it to your home screen so it opens like an app, straight to the camera." },
];

export function Landing() {
  const { session } = useAuth();

  return (
    <main>
      {session ? (
        <section className="hero">
          <h1>Welcome back, {displayName(session)} 👋</h1>
          <p className="lead">
            Good to see you. Got new receipts? Snap them now while they're in your pocket,
            and tax time takes care of itself.
          </p>
          <div className="hero-actions">
            <Link to="/app/upload" className="btn">📸 Add a receipt</Link>
            <Link to="/app" className="btn outline">Go to my dashboard</Link>
          </div>
        </section>
      ) : (
        <section className="hero">
          <h1>Stop losing receipts.<br />Stop dreading tax time.</h1>
          <p className="lead">
            {APP_NAME} is a free receipt scanner and expense tracker for freelancers and small
            businesses. Snap a photo, get it sorted into IRS Schedule C categories, and export a
            tax-ready report.
          </p>
          <Link to="/login?mode=signup" className="btn">Start free</Link>
          <p className="muted small-text">Free to use. No card needed.</p>
        </section>
      )}

      <section className="grid">
        {features.map((f) => (
          <article key={f.title} className="card">
            <div className="icon">{f.icon}</div>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      {!session && (
        <>
          <section className="section">
            <h2 className="section-title">How it works</h2>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={s.title} className="card">
                  <span className="step-num">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p className="muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="section">
            <h2 className="section-title">Questions</h2>
            <div className="faq">
              {faqs.map((f) => (
                <details key={f.q} className="card">
                  <summary>{f.q}</summary>
                  <p className="muted">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="section center">
            <h2 className="section-title">Free guides</h2>
            <p>
              <a href={`${base}guides/schedule-c-expense-categories.html`}>Schedule C expense categories explained</a>
              <br />
              <a href={`${base}guides/how-to-track-receipts-for-taxes.html`}>How to track receipts for taxes as a freelancer</a>
            </p>
            <Link to="/login?mode=signup" className="btn">Start free</Link>
          </section>
        </>
      )}

      <footer className="footer muted">
        <nav className="footer-links">
          <a href={`${base}guides/schedule-c-expense-categories.html`}>Schedule C guide</a>
          <a href={`${base}guides/how-to-track-receipts-for-taxes.html`}>Receipt tracking guide</a>
          <a href={`${base}privacy.html`}>Privacy</a>
          <a href={`${base}terms.html`}>Terms</a>
        </nav>
        {APP_NAME} organizes your expenses; it does not provide tax advice.
      </footer>
    </main>
  );
}
