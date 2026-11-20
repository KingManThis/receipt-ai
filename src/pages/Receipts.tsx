import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchCategories, formatMoney, STATUS_LABEL, type Category, type Receipt } from "../lib/receipts";

export function Receipts() {
  const [params, setParams] = useSearchParams();
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const category = params.get("category") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  useEffect(() => { fetchCategories().then(setCategories).catch(() => {}); }, []);

  useEffect(() => {
    let query = supabase.from("receipts").select("*, categories(name)")
      .order("receipt_date", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(500);
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category_id", category);
    if (from) query = query.gte("receipt_date", from);
    if (to) query = query.lte("receipt_date", to);
    query.then(({ data, error }) => {
      if (error) setError(error.message);
      else setReceipts((data ?? []) as Receipt[]);
    });
  }, [status, category, from, to]);

  // Text search runs in the browser so it matches vendor, notes and payment method together.
  const shown = useMemo(() => {
    if (!receipts) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return receipts;
    return receipts.filter((r) =>
      [r.vendor, r.notes, r.payment_method, r.categories?.name].some((v) => v?.toLowerCase().includes(needle)));
  }, [receipts, q]);

  const total = shown?.reduce((sum, r) => sum + (r.total ?? 0), 0) ?? 0;

  return (
    <main className="container">
      <div className="page-head">
        <h1>Receipts</h1>
        <Link to="/app/upload" className="btn">+ Add</Link>
      </div>

      <div className="filters">
        <input placeholder="Search vendor, notes…" value={q} onChange={(e) => setParam("q", e.target.value)} />
        <select value={status} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <select value={category} onChange={(e) => setParam("category", e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="inline">From <input type="date" value={from} onChange={(e) => setParam("from", e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} onChange={(e) => setParam("to", e.target.value)} /></label>
      </div>

      {error && <p className="alert">{error}</p>}
      {!shown && !error && <p className="muted">Loading…</p>}

      {shown && shown.length === 0 && (
        <div className="card empty">
          <h2>No receipts here yet</h2>
          <p className="muted">Snap your first receipt and the AI will fill in the details.</p>
          <Link to="/app/upload" className="btn">Add a receipt</Link>
        </div>
      )}

      {shown && shown.length > 0 && (
        <>
          <p className="muted small-text">{shown.length} receipt{shown.length === 1 ? "" : "s"} · {formatMoney(total)}</p>
          <ul className="receipt-list">
            {shown.map((r) => (
              <li key={r.id}>
                <Link to={`/app/receipts/${r.id}`} className="card receipt-row">
                  <div>
                    <strong>{r.vendor || "Unknown vendor"}</strong>
                    <div className="muted small-text">
                      {r.receipt_date ?? "No date"} · {r.categories?.name ?? "Uncategorized"}
                    </div>
                  </div>
                  <div className="right">
                    <strong>{formatMoney(r.total, r.currency)}</strong>
                    <div><span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
