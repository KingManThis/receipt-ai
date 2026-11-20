import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { importFresh } from "../lib/appVersion";
import { formatMoney } from "../lib/receipts";
import {
  receiptFileName, receiptsCsv, summarize, summaryCsv, type ExportReceipt,
} from "../lib/exportData";

type Scope = "all" | "confirmed";

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function Export() {
  const thisYear = new Date().getFullYear();
  const [period, setPeriod] = useState<string>(String(thisYear));
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(`${thisYear}-12-31`);
  const [scope, setScope] = useState<Scope>("all");
  const [receipts, setReceipts] = useState<ExportReceipt[] | null>(null);
  const [years, setYears] = useState<number[]>([thisYear]);
  const [undated, setUndated] = useState(0);
  const [zipProgress, setZipProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = period === "custom" ? { from, to } : { from: `${period}-01-01`, to: `${period}-12-31` };
  const periodLabel = period === "custom" ? `${from} to ${to}` : `Tax year ${period}`;

  // Years that have receipts, for the picker.
  useEffect(() => {
    supabase.from("receipts").select("receipt_date").not("receipt_date", "is", null).then(({ data }) => {
      const ys = new Set((data ?? []).map((r) => Number(r.receipt_date!.slice(0, 4))));
      ys.add(thisYear);
      setYears([...ys].sort((a, b) => b - a));
    });
    supabase.from("receipts").select("id", { count: "exact", head: true }).is("receipt_date", null)
      .then(({ count }) => setUndated(count ?? 0));
  }, [thisYear]);

  useEffect(() => {
    setReceipts(null);
    supabase.from("receipts")
      .select("id, receipt_date, vendor, subtotal, tax, total, currency, payment_method, notes, status, image_path, category:categories(name, schedule_c_line, deductible_percent)")
      .gte("receipt_date", range.from).lte("receipt_date", range.to)
      .order("receipt_date")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setReceipts((data ?? []) as unknown as ExportReceipt[]);
      });
  }, [range.from, range.to]);

  const included = useMemo(
    () => (receipts ?? []).filter((r) => scope === "all" || r.status === "confirmed"),
    [receipts, scope],
  );
  const summary = useMemo(() => summarize(included), [included]);
  const unreviewed = (receipts ?? []).filter((r) => r.status !== "confirmed").length;
  const maxTotal = Math.max(1, ...summary.rows.map((r) => r.total));
  const slug = period === "custom" ? `${from}_to_${to}` : period;

  async function downloadZip() {
    setError(null);
    const { zipSync, strToU8 } = await importFresh(() => import("fflate"));
    const used = new Set<string>();
    const names = new Map<string, string>();
    const files: Record<string, Uint8Array> = {};
    const withFiles = included.filter((r) => r.image_path);
    let done = 0;
    let failed = 0;
    const queue = [...withFiles];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const { data, error } = await supabase.storage.from("receipts").download(r.image_path!);
        if (error || !data) { failed++; continue; }
        const name = receiptFileName(r, used);
        names.set(r.id, name);
        files[`receipts/${name}`] = new Uint8Array(await data.arrayBuffer());
        done++;
        setZipProgress(`Downloading ${done} of ${withFiles.length}…`);
      }
    };
    setZipProgress(`Downloading 0 of ${withFiles.length}…`);
    await Promise.all([worker(), worker(), worker(), worker()]);
    setZipProgress("Zipping…");
    files["receipts.csv"] = strToU8(receiptsCsv(included, names));
    files["summary.csv"] = strToU8(summaryCsv(summary, periodLabel));
    // Images are already compressed; level 0 makes zipping instant.
    const zip = zipSync(files, { level: 0 });
    download(`receipts_${slug}.zip`, zip, "application/zip");
    setZipProgress(null);
    if (failed) setError(`${failed} file${failed === 1 ? "" : "s"} couldn't be downloaded and ${failed === 1 ? "was" : "were"} left out.`);
  }

  return (
    <main className="container">
      <div className="page-head no-print">
        <h1>Export</h1>
      </div>

      <div className="card filters export-controls no-print">
        <label className="inline">Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {years.map((y) => <option key={y} value={y}>Tax year {y}</option>)}
            <option value="custom">Custom dates…</option>
          </select>
        </label>
        {period === "custom" && (
          <>
            <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </>
        )}
        <label className="inline">Include
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="all">All receipts</option>
            <option value="confirmed">Confirmed only</option>
          </select>
        </label>
      </div>

      {error && <p className="alert no-print">{error}</p>}
      {!receipts && !error && <p className="muted">Loading…</p>}

      {receipts && scope === "all" && unreviewed > 0 && (
        <p className="hint no-print">
          {unreviewed} receipt{unreviewed === 1 ? " hasn't" : "s haven't"} been reviewed yet.{" "}
          <Link to="/app/receipts?status=needs_review">Review them</Link> before sending anything to your accountant.
        </p>
      )}

      {undated > 0 && (
        <p className="hint no-print">
          {undated} receipt{undated === 1 ? " has" : "s have"} no date, so {undated === 1 ? "it isn't" : "they aren't"} in any period.{" "}
          <Link to="/app/receipts">Add the date</Link> to include {undated === 1 ? "it" : "them"}.
        </p>
      )}

      {receipts && (
        <>
          <div className="export-buttons no-print">
            <button className="btn" disabled={!included.length}
              onClick={() => download(`receipts_${slug}.csv`, receiptsCsv(included), "text/csv;charset=utf-8")}>
              ⬇ Receipts CSV
            </button>
            <button className="btn outline" disabled={!included.length}
              onClick={() => download(`summary_${slug}.csv`, summaryCsv(summary, periodLabel), "text/csv;charset=utf-8")}>
              ⬇ Summary CSV
            </button>
            <button className="btn outline" disabled={!included.length || zipProgress != null} onClick={downloadZip}>
              {zipProgress ?? "⬇ ZIP of images + CSVs"}
            </button>
            <button className="btn outline" disabled={!included.length} onClick={() => window.print()}>
              🖨 Print / save PDF
            </button>
          </div>

          <section className="card summary">
            <h2>Expense summary · {periodLabel}</h2>
            <p className="muted small-text">
              {included.length} receipt{included.length === 1 ? "" : "s"} · {scope === "confirmed" ? "confirmed only" : "all receipts"}
            </p>

            {included.length === 0 ? (
              <p className="muted">No receipts with a date in this period.</p>
            ) : (
              <table className="summary-table">
                <thead>
                  <tr><th>Sch. C</th><th>Category</th><th className="num">Receipts</th><th className="num">Spent</th><th className="num">Deductible</th></tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.category}>
                      <td className="muted">{r.line || "—"}</td>
                      <td>
                        {r.category}
                        {r.deductiblePercent != null && r.deductiblePercent < 100 && (
                          <span className="muted small-text"> ({r.deductiblePercent}%)</span>
                        )}
                        <div className="bar"><span style={{ width: `${(r.total / maxTotal) * 100}%` }} /></div>
                      </td>
                      <td className="num">{r.count}</td>
                      <td className="num">{formatMoney(r.total)}</td>
                      <td className="num">{formatMoney(r.deductible)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td></td><td>Total</td>
                    <td className="num">{included.length}</td>
                    <td className="num">{formatMoney(summary.total)}</td>
                    <td className="num">{formatMoney(summary.deductible)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            <p className="muted small-text disclaimer">
              Amounts are in each receipt's own currency and added together as-is. This summary organizes your
              expenses; it isn't tax advice. Confirm categories and amounts with a tax professional.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
