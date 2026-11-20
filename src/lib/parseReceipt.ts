// Turns raw receipt text (from OCR or a PDF) into structured fields using rules.
// Pure functions with no browser APIs, so they can be tested in Node.

export type Parsed = {
  vendor: string | null;
  receipt_date: string | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  payment_method: string | null;
  category: string | null;
  uncertain_fields: string[];
};

const AMOUNT = /(?:^|[^\d.,])(-?)\$?\s?(\d{1,3}(?:,\d{3})+|\d+)\s?[.,]\s?(\d{2})(?![\d%])/g;

/** All money-looking amounts in a line, in order. */
export function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const value = Number(`${m[2].replace(/,/g, "")}.${m[3]}`);
    if (Number.isFinite(value)) out.push(m[1] === "-" ? -value : value);
  }
  return out;
}

const lastAmount = (line: string) => {
  const a = amountsIn(line);
  return a.length ? a[a.length - 1] : null;
};

/** Common OCR slips in keywords: 0→O, 1→I/L, 5→S. Only used for matching labels, never amounts. */
const label = (line: string) =>
  line.toLowerCase().replace(/0/g, "o").replace(/[1|]/g, "l").replace(/5/g, "s").replace(/\s+/g, " ");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoDate(y: number, m: number, d: number, today: Date): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // e.g. Feb 31
  const tomorrow = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (date.getTime() > tomorrow) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function findDate(text: string, today = new Date()): string | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/, (m) => isoDate(+m[1], +m[2], +m[3], today)],
    // US style first: MM/DD/YYYY or MM/DD/YY
    [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/, (m) =>
      isoDate(+m[3], +m[1], +m[2], today) ?? isoDate(+m[3], +m[2], +m[1], today)],
    [/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i, (m) => {
      const mi = MONTHS.indexOf(m[1].toLowerCase());
      return mi >= 0 ? isoDate(+m[3], mi + 1, +m[2], today) : null;
    }],
    [/\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})\b/i, (m) => {
      const mi = MONTHS.indexOf(m[2].toLowerCase());
      return mi >= 0 ? isoDate(+m[3], mi + 1, +m[1], today) : null;
    }],
  ];
  for (const line of text.split("\n")) {
    for (const [re, toIso] of patterns) {
      // A line can hold several dates (e.g. travel date and booking date): take the first valid one.
      for (const m of line.matchAll(new RegExp(re.source, re.flags + "g"))) {
        const iso = toIso(m);
        if (iso) return iso;
      }
    }
  }
  return null;
}

const NOT_VENDOR = /receipt|invoice|welcome|thank|customer|copy|order\s*#|store\s*#|tel|phone|www\.|\.com|http|cashier|server|table|guest|date|time/i;

function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc)\b/g, (w) => w.toUpperCase());
}

export function findVendor(lines: string[]): string | null {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.replace(/[^\p{L}\p{N}&'.,\- ]/gu, " ").replace(/\s+/g, " ").trim();
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (letters < 3 || letters < line.length * 0.5) continue; // mostly digits or symbols: address, phone, noise
    if (NOT_VENDOR.test(line)) continue;
    if (/^\d+\s+\w+/.test(line) && /\b(st|street|ave|avenue|rd|road|blvd|dr|drive|suite|ste|hwy|way|ln|lane)\b/i.test(line)) continue;
    if (amountsIn(line).length) continue;
    return titleCase(line).slice(0, 60);
  }
  return null;
}

export function findPayment(text: string): string | null {
  const brand = text.match(/\b(visa|mastercard|master card|mc|amex|american express|discover|debit|apple pay|google pay|paypal|cash)\b/i);
  // OCR often garbles the mask (e.g. "*#**xx****%%4242"), so accept any run of mask-like symbols.
  const last4 = text.match(/(?:[*x#%•.]{3,}|ending(?: in)?|acct|account)\s*:?\s*(\d{4})\b/i);
  if (!brand && !last4) return null;
  const name = brand
    ? ({ mc: "Mastercard", "master card": "Mastercard", amex: "Amex", "american express": "Amex" } as Record<string, string>)[brand[1].toLowerCase()]
      ?? brand[1].replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase())
    : "Card";
  return last4 && name !== "Cash" ? `${name} •${last4[1]}` : name;
}

/** Keyword → category name. Names must match the built-in categories in the database. */
const CATEGORY_RULES: [RegExp, string][] = [
  [/uber\s*eats|doordash|grubhub|restaurant|cafe|café|coffee|starbucks|dunkin|bistro|grill|pizza|burger|taco|sushi|bakery|diner|kitchen|bar & grill|mcdonald|chipotle|subway|panera|gratuity|\btip\b/i, "Meals (business)"],
  [/airline|airways|delta|united|southwest|jetblue|american air|hotel|inn\b|marriott|hilton|hyatt|airbnb|amtrak|lyft|\buber\b|taxi|boarding/i, "Travel"],
  [/shell|chevron|exxon|mobil|\bbp\b|texaco|valero|sunoco|gallons?|fuel|unleaded|parking|car wash|toll/i, "Car & truck expenses"],
  [/adobe|microsoft|google workspace|github|notion|figma|canva|zoom|dropbox|slack|openai|anthropic|subscription|saas|software|app store|icloud/i, "Software & subscriptions"],
  [/verizon|at&t|t-mobile|tmobile|comcast|xfinity|spectrum|internet|wireless/i, "Phone & internet"],
  [/staples|office depot|officemax|usps|fedex|\bups\b|postage|shipping|printer|ink|paper/i, "Office expenses"],
  [/home depot|lowe'?s|hardware|ace hardware|menards/i, "Supplies"],
  [/udemy|coursera|skillshare|masterclass|course|tuition|seminar|conference|workshop|bookstore|books/i, "Education & training"],
  [/facebook ads|meta ads|google ads|advertis|marketing|vistaprint|business cards/i, "Advertising & marketing"],
  [/stripe fee|paypal fee|bank fee|service charge|wire fee/i, "Bank & payment fees"],
  [/insurance|premium/i, "Insurance (business)"],
  [/attorney|legal|cpa|accounting|bookkeep/i, "Legal & professional services"],
];

export function guessCategory(text: string): string | null {
  for (const [re, name] of CATEGORY_RULES) if (re.test(text)) return name;
  return null;
}

export function parseReceipt(text: string, today = new Date()): Parsed {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const uncertain: string[] = [];

  let subtotal: number | null = null;
  let tax: number | null = null;
  let tip: number | null = null;
  let tendered: number | null = null;
  let change: number | null = null;
  const totalCandidates: { value: number; strong: boolean }[] = [];

  for (const line of lines) {
    const l = label(line);
    const amount = lastAmount(line);
    if (amount == null) continue;
    if (/sub\s*-?\s*tota?l/.test(l)) { subtotal ??= amount; continue; }
    if (/\b(tip|gratuity)\b/.test(l)) { tip ??= amount; continue; }
    if (/\b(tax|vat|gst|hst|pst)\b/.test(l) && !/before tax|pre-?tax|tax ?exempt/.test(l)) { tax ??= amount; continue; }
    if (/\bchange\b/.test(l)) { change ??= amount; continue; }
    if (/tend(er|ered)|\bcash\b/.test(l) && !/total/.test(l)) { tendered ??= amount; continue; }
    if (/sav(ed|ings)|discount|cash back|you saved|points|items?\b|qty/.test(l)) continue;
    if (/grand total|amount due|balance due|total due|amount paid|total charged|total amount|\btotal\b|\bamount\b|\bbalance\b/.test(l)) {
      totalCandidates.push({ value: amount, strong: /grand total|amount due|balance due|total due|total amount|\btotal\b/.test(l) });
    }
  }

  let total: number | null = null;
  const strong = totalCandidates.filter((c) => c.strong);
  const pool = strong.length ? strong : totalCandidates;
  if (pool.length) total = Math.max(...pool.map((c) => c.value));
  if (total == null && tendered != null && change != null && tendered > change) {
    // Cash receipt without a total line: paid minus change.
    total = Math.round((tendered - change) * 100) / 100;
  } else if (total == null) {
    // No "total" label: fall back to the largest amount, ignoring cash handed over and change.
    const all = lines
      .filter((line) => !/\bchange\b|tend(er|ered)|\bcash\b/.test(label(line)))
      .flatMap(amountsIn).filter((a) => a > 0);
    if (all.length) total = Math.max(...all);
    uncertain.push("total");
  }
  if (subtotal != null && total != null && total < subtotal) uncertain.push("total");
  if (subtotal == null && total != null && tax != null && tax < total) subtotal = Math.round((total - tax - (tip ?? 0)) * 100) / 100;

  const vendor = findVendor(lines);
  const receipt_date = findDate(lines.join("\n"), today);
  const category = guessCategory(text);

  if (!vendor) uncertain.push("vendor");
  if (!receipt_date) uncertain.push("receipt_date");
  if (!category) uncertain.push("category");

  return {
    vendor, receipt_date, subtotal, tax, tip, total,
    payment_method: findPayment(text),
    category,
    uncertain_fields: [...new Set(uncertain)],
  };
}
