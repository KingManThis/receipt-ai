import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatMoney } from "../lib/receipts";
import { useAuth } from "../components/AuthProvider";
import { RECEIPT_READER } from "../config";
import { displayName, timeGreeting } from "../lib/greeting";

type Stats = { count: number; needsReview: number; yearTotal: number; monthTotal: number; aiUsed: number };

export function Dashboard() {
  const { session } = useAuth();
  const [plan, setPlan] = useState<string>("free");
  const [fullName, setFullName] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const now = new Date();
    const year = `${now.getFullYear()}-01-01`;
    const month = now.toISOString().slice(0, 7) + "-01";
    Promise.all([
      supabase.from("profiles").select("plan, full_name").single(),
      supabase.from("receipts").select("total, receipt_date, status"),
      supabase.from("usage").select("receipts_processed").eq("month", month).maybeSingle(),
    ]).then(([p, r, u]) => {
      if (p.data) { setPlan(p.data.plan); setFullName(p.data.full_name); }
      const rows = r.data ?? [];
      setStats({
        count: rows.length,
        needsReview: rows.filter((x) => x.status === "needs_review" || x.status === "failed").length,
        yearTotal: rows.filter((x) => x.receipt_date && x.receipt_date >= year).reduce((s, x) => s + (x.total ?? 0), 0),
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

      {stats && stats.needsReview > 0 && (
        <Link to="/app/receipts?status=needs_review" className="card banner">
          {stats.needsReview} receipt{stats.needsReview === 1 ? "" : "s"} to review →
        </Link>
      )}

      <div className="grid">
        <div className="card stat"><span className="muted">Spent this month</span><strong>{stats ? formatMoney(stats.monthTotal) : "…"}</strong></div>
        <div className="card stat"><span className="muted">Spent this year</span><strong>{stats ? formatMoney(stats.yearTotal) : "…"}</strong></div>
        <div className="card stat"><span className="muted">Receipts saved</span><strong>{stats?.count ?? "…"}</strong></div>
        {RECEIPT_READER === "claude" ? (
          <div className="card stat">
            <span className="muted">AI reads this month</span>
            <strong>{stats ? (plan === "pro" ? stats.aiUsed : `${stats.aiUsed} / 20`) : "…"}</strong>
          </div>
        ) : (
          <div className="card stat"><span className="muted">To review</span><strong>{stats?.needsReview ?? "…"}</strong></div>
        )}
      </div>

      {stats?.count === 0 && (
        <div className="card empty">
          <h2>Add your first receipt</h2>
          <p className="muted">Snap a photo and we fill in the vendor, date and amounts for you to check.</p>
          <Link to="/app/upload" className="btn">Add a receipt</Link>
        </div>
      )}
      {stats && stats.count > 0 && <p><Link to="/app/receipts">See all receipts →</Link></p>}
    </main>
  );
}
