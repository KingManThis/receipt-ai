import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  deleteReceipt, deductibleOf, fetchCategories, formatMoney, reread, signedUrl, STATUS_LABEL, type Category, type Receipt,
} from "../lib/receipts";

type Form = {
  vendor: string; receipt_date: string; subtotal: string; tax: string; total: string;
  currency: string; category_id: string; payment_method: string; notes: string;
};

const toForm = (r: Receipt): Form => ({
  vendor: r.vendor ?? "",
  receipt_date: r.receipt_date ?? "",
  subtotal: r.subtotal?.toString() ?? "",
  tax: r.tax?.toString() ?? "",
  total: r.total?.toString() ?? "",
  currency: r.currency ?? "USD",
  category_id: r.category_id ?? "",
  payment_method: r.payment_method ?? "",
  notes: r.notes ?? "",
});

export type SavedItem = {
  vendor: string; total: number | null; currency: string; category: string | null; percent: number | null; deductible: number;
};

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const flow = (useLocation().state ?? {}) as {
    fresh?: boolean; queue?: string[]; total?: number; savedItems?: SavedItem[];
  };
  const queue = flow.queue ?? [];
  const position = flow.total ? flow.total - queue.length : 0;
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "retry" | "delete">("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from("receipts").select("*").eq("id", id!).single();
    if (error || !data) { setError("Receipt not found."); return; }
    const r = data as Receipt;
    setReceipt(r);
    setForm(toForm(r));
    if (r.image_path) setImageUrl(await signedUrl(r.image_path));
  }

  useEffect(() => {
    setImageUrl(null);
    load();
    fetchCategories().then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error && !receipt) return <main className="container"><p className="alert">{error}</p></main>;
  if (!receipt || !form) return <main className="container"><p className="muted">Loading…</p></main>;

  const uncertain = new Set(receipt.status === "needs_review" ? receipt.ai_raw?.uncertain_fields ?? [] : []);
  const field = (key: keyof Form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }),
    className: uncertain.has(key === "category_id" ? "category" : key) ? "uncertain" : undefined,
  });
  const isPdf = receipt.image_path?.endsWith(".pdf");
  const category = categories.find((c) => c.id === form.category_id);
  const total = num(form.total);
  const deductible = deductibleOf(total, category?.deductible_percent);
  const amountsDontAddUp = num(form.subtotal) != null && num(form.total) != null &&
    Math.abs((num(form.subtotal) ?? 0) + (num(form.tax) ?? 0) - (num(form.total) ?? 0)) > 0.02 &&
    !(receipt.notes ?? "").includes("Tip");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    const { error } = await supabase.from("receipts").update({
      vendor: form!.vendor.trim() || null,
      receipt_date: form!.receipt_date || null,
      subtotal: num(form!.subtotal),
      tax: num(form!.tax),
      total: num(form!.total),
      currency: form!.currency.trim().toUpperCase() || "USD",
      category_id: form!.category_id || null,
      payment_method: form!.payment_method.trim() || null,
      notes: form!.notes.trim() || null,
      status: "confirmed",
    }).eq("id", receipt!.id);
    setBusy("");
    if (error) { setError(error.message); return; }

    const saved = {
      vendor: form!.vendor.trim() || "Receipt",
      total,
      currency: form!.currency.trim().toUpperCase() || "USD",
      category: category?.name ?? null,
      percent: category?.deductible_percent ?? null,
      deductible,
    };
    const savedItems = [...(flow.savedItems ?? []), saved];
    if (queue.length) {
      // More receipts from the same upload: check the next one.
      navigate(`/app/receipts/${queue[0]}`, { state: { fresh: true, queue: queue.slice(1), total: flow.total, savedItems } });
    } else {
      // All done: back home with a summary of what was just added.
      navigate("/app", { state: { savedItems } });
    }
  }

  async function retry() {
    setBusy("retry");
    setError(null);
    try { await reread(receipt!); } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    await load();
    setBusy("");
  }

  async function remove() {
    if (!confirm("Delete this receipt and its image? This can't be undone.")) return;
    setBusy("delete");
    try { await deleteReceipt(receipt!); navigate("/app/receipts"); }
    catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); setBusy(""); }
  }

  return (
    <main className="container">
      <p><Link to="/app/receipts">← All receipts</Link></p>
      <div className="page-head">
        <h1>{receipt.vendor || "Receipt"}</h1>
        <span className={`badge ${receipt.status}`}>{STATUS_LABEL[receipt.status]}</span>
      </div>

      {receipt.ai_raw?.is_receipt === false && (
        <p className="alert">This doesn't look like a receipt. Check the image.</p>
      )}
      {receipt.status === "failed" && (
        <p className="alert">{receipt.ai_raw?.error ?? "We couldn't read this one."} Fill it in by hand or try again.</p>
      )}
      {receipt.status === "processing" && !flow.fresh && Date.now() - new Date(receipt.created_at).getTime() > 60_000 && (
        <p className="hint">This receipt was uploaded but never finished scanning. Tap <b>Scan again</b> below, or fill it in by hand.</p>
      )}
      {flow.fresh && receipt.status !== "failed" && (
        <p className="success">
          ✨ Scanned!{flow.total && flow.total > 1 ? ` Receipt ${position} of ${flow.total}.` : ""} Check the details, pick a category, then tap <b>Save</b>.
        </p>
      )}
      {uncertain.size > 0 && <p className="hint">Highlighted fields were hard to read or missing. Please check them.</p>}

      <div className="detail">
        <div className="card preview">
          {!imageUrl && <p className="muted">No image</p>}
          {imageUrl && isPdf && <a href={imageUrl} target="_blank" rel="noreferrer">Open PDF ↗</a>}
          {imageUrl && !isPdf && (
            <a href={imageUrl} target="_blank" rel="noreferrer"><img src={imageUrl} alt="Receipt" /></a>
          )}
        </div>

        <form className="card" onSubmit={save}>
          <label>Vendor<input {...field("vendor")} /></label>
          <label>Date<input type="date" {...field("receipt_date")} /></label>
          <div className="three">
            <label>Subtotal<input inputMode="decimal" type="number" step="0.01" {...field("subtotal")} /></label>
            <label>Tax<input inputMode="decimal" type="number" step="0.01" {...field("tax")} /></label>
            <label>Total<input inputMode="decimal" type="number" step="0.01" {...field("total")} /></label>
          </div>
          {amountsDontAddUp && <p className="hint">Subtotal + tax doesn't equal the total. Worth a quick check.</p>}
          <label>Category
            <select {...field("category_id")}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.schedule_c_line ? ` (Sch. C ${c.schedule_c_line})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="calc" aria-live="polite">
            {total == null ? (
              <span className="muted">Enter the total to see what you can deduct.</span>
            ) : !category ? (
              <span className="muted">Pick a category to see how much of {formatMoney(total, form.currency)} is tax-deductible.</span>
            ) : category.deductible_percent === 0 ? (
              <span><b>Not deductible</b> <span className="muted">(personal expense)</span></span>
            ) : (
              <span>
                Tax-deductible: <b>{formatMoney(deductible, form.currency)}</b>
                {category.deductible_percent < 100 && <span className="muted"> ({category.deductible_percent}% of {formatMoney(total, form.currency)})</span>}
                {category.schedule_c_line && <span className="muted"> · Schedule C {category.schedule_c_line}</span>}
              </span>
            )}
          </div>
          <div className="two">
            <label>Payment method<input {...field("payment_method")} /></label>
            <label>Currency<input maxLength={3} {...field("currency")} /></label>
          </div>
          <label>Notes<textarea rows={2} {...field("notes")} /></label>
          {receipt.ai_raw?.text && (
            <details className="scanned">
              <summary>Scanned text</summary>
              <pre>{receipt.ai_raw.text}</pre>
            </details>
          )}

          {error && <p className="alert">{error}</p>}
          <button className="btn full" disabled={!!busy}>{busy === "save" ? "Saving…" : queue.length ? `Save & next (${queue.length} left)` : "Save"}</button>
          <div className="row-actions">
            <button type="button" className="link" onClick={retry} disabled={!!busy}>
              {busy === "retry" ? "Scanning…" : "Scan again"}
            </button>
            <button type="button" className="link danger" onClick={remove} disabled={!!busy}>Delete</button>
          </div>
        </form>
      </div>
    </main>
  );
}
