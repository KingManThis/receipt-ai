import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { deductibleOf, formatMoney } from "../lib/receipts";
import { useAuth } from "../components/AuthProvider";
import { RECEIPT_READER } from "../config";
import { displayName, timeGreeting } from "../lib/greeting";
import { InstallPrompt } from "../components/InstallPrompt";
import type { SavedItem } from "./ReceiptDetail";

type Stats = {
  count: number; needsReview: number; yearTotal: number; monthTotal: number; yearDeductible: number; aiUsed: number;
};

type SavedSummary = { savedItems?: SavedItem[] };

export function Dashboard() {
  const { session } = useAuth();
  const [plan, setPlan] = useState<string>("free");
  const [fullName, setFullName] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const navigate = useNavigate();
  const justSaved = ((useLocation().state ?? {}) as SavedSummary).savedItems ?? null;
  const savedTotal = justSaved?.reduce((s, i) => s + (i.total ?? 0), 0) ?? 0;
  const savedDeductible = justSaved?.reduce((s, i) => s + i.deductible, 0) ?? 0;

  useEffect(() => {
    const now = new Date();
    const year = `${now.getFullYear()}-01-01`;
    const month = now.toISOString().slice(0, 7) + "-01";
    Promise.all([
      supabase.from("profiles").select("plan, full_name").single(),
      supabase.from("receipts").select("total, receipt_date, status, categories(deductible_percent)"),
      supabase.from("usage").select("receipts_processed").eq("month", month).maybeSingle(),
    ]).then(([p, r, u]) => {
      if (p.data) { setPlan(p.data.plan); setFullName(p.data.full_name); }
      const rows = (r.data ?? []) as unknown as {
        total: number | null; receipt_date: string | null; status: string;
        categories: { deductible_percent: number } | null;
      }[];
      const thisYear = rows.filter((x) => x.receipt_date && x.receipt_date >= year);
      setStats({
        count: rows.length,
        needsReview: rows.filter((x) => x.status !== "confirmed").length,
        yearTotal: thisYear.reduce((s, x) => s + (x.total ?? 0), 0),
        yearDeductible: thisYear.reduce((s, x) => s + deductibleOf(x.total, x.categories?.deductible_percent), 0),
        monthTotal: rows.filter((x) => x.receipt_date && x.receipt_date >= month).reduce((s, x) => s + (x.total ?? 0), 0),
        aiUsed: u.data?.receipts_processed ?? 0,
      });
    });
  }, []);

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>{timeGreeting()}, {displayName(session, fullName)} 👋</h1>
          <p className="muted subtitle">
            {stats == null ? "\u00a0"
              : stats.needsReview > 0 ? "A few receipts are waiting for a quick check."
              : stats.count > 0 ? "You're all caught up. Nice work!"
              : "Let's get your first receipt in."}
          </p>
        </div>
        <Link to="/app/upload" className="btn">📸 Add receipt</Link>
      </div>

      {justSaved && justSaved.length > 0 && (
        <div className="card saved-summary" role="status">
          <div className="saved-head">
            <strong>✅ {justSaved.length > 1 ? `${justSaved.length} receipts saved!` : "Receipt saved!"}</strong>
            <button className="link small-text" onClick={() => navigate(".", { replace: true, state: null })}>Dismiss</button>
          </div>
          <ul className="saved-items">
            {justSaved.map((i, idx) => (
              <li key={idx}>
                <span><b>{i.vendor}</b> <span className="muted">→ {i.category ?? "no category yet"}</span></span>
                <span className="num">
                  {formatMoney(i.total, i.currency)}
                  {i.category && (
                    <span className="muted small-text">
                      {" "}{i.percent === 0 ? "· personal" : `· ${formatMoney(i.deductible, i.currency)} deductible${i.percent != null && i.percent < 100 ? ` (${i.percent}%)` : ""}`}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {justSaved.length > 1 && (
            <p className="small-text">Added <b>{formatMoney(savedTotal)}</b> in expenses, <b>{formatMoney(savedDeductible)}</b> of it deductible.</p>
          )}
          {stats && (
            <p className="small-text">
              This month you've spent <b>{formatMoney(stats.monthTotal)}</b>, and you have{" "}
              <b>{formatMoney(stats.yearDeductible)}</b> in deductions so far this year.
            </p>
          )}
          {justSaved.some((i) => !i.category) && (
            <p className="hint small-text">Tip: give every receipt a category so it counts toward your tax summary.</p>
          )}
          <div className="hero-actions left">
            <Link to="/app/upload" className="btn small">📸 Add another</Link>
            <Link to="/app/receipts" className="btn small outline">See all receipts</Link>
          </div>
        </div>
      )}

      <InstallPrompt />

      {stats && stats.needsReview > 0 && (
        <Link to="/app/receipts?status=needs_review" className="card banner">
          {stats.needsReview} receipt{stats.needsReview === 1 ? "" : "s"} to review →
        </Link>
      )}

      <div className="grid">
        <div className="card stat"><span className="muted">Spent this month</span><strong>{stats ? formatMoney(stats.monthTotal) : "…"}</strong></div>
        <div className="card stat"><span className="muted">Spent this year</span><strong>{stats ? formatMoney(stats.yearTotal) : "…"}</strong></div>
        <div className="card stat"><span className="muted">Deductible this year</span><strong>{stats ? formatMoney(stats.yearDeductible) : "…"}</strong></div>
        <div className="card stat"><span className="muted">Receipts saved</span><strong>{stats?.count ?? "…"}</strong></div>
        {RECEIPT_READER === "claude" ? (
          <div className="card stat">
            <span className="muted">AI reads this month</span>
            <strong>{stats ? (plan === "pro" ? stats.aiUsed : `${stats.aiUsed} / 20`) : "…"}</strong>
          </div>
        ) : null}
      </div>

      {stats?.count === 0 && (
        <div className="card empty">
          <h2>Add your first receipt</h2>
          <p className="muted">Snap a photo and we fill in the vendor, date and amounts for you to check.</p>
          <Link to="/app/upload" className="btn">Add a receipt</Link>
        </div>
      )}
      {stats && stats.count > 0 && (
        <p className="links-row">
          <Link to="/app/receipts">See all receipts →</Link>
          <Link to="/app/export">Export for taxes →</Link>
        </p>
      )}
    </main>
  );
}
