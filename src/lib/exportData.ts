// Pure helpers for exports: CSV building, tax summary and file naming. No browser APIs, so testable in Node.

export type ExportReceipt = {
  id: string;
  receipt_date: string | null;
  vendor: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string;
  payment_method: string | null;
  notes: string | null;
  status: string;
  image_path: string | null;
  category: { name: string; schedule_c_line: string | null; deductible_percent: number } | null;
};

export type SummaryRow = {
  category: string;
  line: string;
  count: number;
  total: number;
  deductiblePercent: number | null; // null when the row mixes percentages (never happens per category)
  deductible: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function deductibleAmount(r: ExportReceipt): number {
  if (r.total == null || !r.category) return 0;
  return round2((r.total * r.category.deductible_percent) / 100);
}

/** Readable, sortable, filesystem-safe name: 2026-11-18_Blue-Bottle-Coffee_13.60.jpg */
export function receiptFileName(r: ExportReceipt, used: Set<string>): string {
  const ext = r.image_path?.split(".").pop()?.toLowerCase() ?? "jpg";
  const vendor = (r.vendor ?? "Unknown")
    .normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "Unknown";
  const base = `${r.receipt_date ?? "no-date"}_${vendor}_${r.total != null ? r.total.toFixed(2) : "0.00"}`;
  let name = `${base}.${ext}`;
  for (let i = 2; used.has(name); i++) name = `${base}_${i}.${ext}`;
  used.add(name);
  return name;
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Stop spreadsheet apps from treating text as a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (e.g. café, •) correctly.
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function receiptsCsv(receipts: ExportReceipt[], fileNames?: Map<string, string>): string {
  const header = [
    "Date", "Vendor", "Category", "Schedule C line", "Subtotal", "Tax", "Total", "Currency",
    "Deductible %", "Deductible amount", "Payment method", "Notes", "Status", "Receipt file",
  ];
  const rows = receipts.map((r) => [
    r.receipt_date, r.vendor, r.category?.name ?? "Uncategorized", r.category?.schedule_c_line,
    r.subtotal?.toFixed(2), r.tax?.toFixed(2), r.total?.toFixed(2), r.currency,
    r.category ? r.category.deductible_percent : "", deductibleAmount(r).toFixed(2),
    r.payment_method, r.notes, r.status, fileNames?.get(r.id) ?? "",
  ]);
  return toCsv([header, ...rows]);
}

export function summarize(receipts: ExportReceipt[]): { rows: SummaryRow[]; total: number; deductible: number } {
  const map = new Map<string, SummaryRow>();
  for (const r of receipts) {
    const key = r.category?.name ?? "Uncategorized";
    const row = map.get(key) ?? {
      category: key,
      line: r.category?.schedule_c_line ?? "",
      count: 0, total: 0,
      deductiblePercent: r.category ? r.category.deductible_percent : null,
      deductible: 0,
    };
    row.count++;
    row.total = round2(row.total + (r.total ?? 0));
    row.deductible = round2(row.deductible + deductibleAmount(r));
    map.set(key, row);
  }
  const lineOrder = (l: string) => {
    const m = l.match(/(\d+)([a-z]?)/);
    return m ? Number(m[1]) * 10 + (m[2] ? m[2].charCodeAt(0) - 96 : 0) : 9999;
  };
  const rows = [...map.values()].sort((a, b) => lineOrder(a.line) - lineOrder(b.line) || a.category.localeCompare(b.category));
  return {
    rows,
    total: round2(rows.reduce((s, r) => s + r.total, 0)),
    deductible: round2(rows.reduce((s, r) => s + r.deductible, 0)),
  };
}

export function summaryCsv(summary: ReturnType<typeof summarize>, periodLabel: string): string {
  return toCsv([
    [`Expense summary: ${periodLabel}`],
    [],
    ["Schedule C line", "Category", "Receipts", "Total spent", "Deductible %", "Deductible amount"],
    ...summary.rows.map((r) => [r.line, r.category, r.count, r.total.toFixed(2), r.deductiblePercent ?? "", r.deductible.toFixed(2)]),
    [],
    ["", "TOTAL", summary.rows.reduce((s, r) => s + r.count, 0), summary.total.toFixed(2), "", summary.deductible.toFixed(2)],
    [],
    ["Organized by ReceiptPilot. Not tax advice: confirm categories and amounts with a tax professional."],
  ]);
}
