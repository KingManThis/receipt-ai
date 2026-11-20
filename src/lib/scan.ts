// Free, on-device receipt reading: pdf.js for PDFs with real text, Tesseract.js OCR for photos.
// Both libraries load only when first used, so the rest of the app stays fast.

export type ScanResult = { text: string; confidence: number; engine: "pdf-text" | "tesseract" };

type Progress = (stage: string) => void;

/** Grayscale + contrast stretch: noticeably better OCR on faded thermal receipts. */
async function prepareForOcr(source: Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  let canvas: HTMLCanvasElement;
  if (source instanceof HTMLCanvasElement) {
    canvas = source;
  } else {
    const bitmap = await createImageBitmap(source);
    canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

function getWorker() {
  const base = import.meta.env.BASE_URL + "tesseract";
  workerPromise ??= import("tesseract.js").then(({ createWorker }) =>
    createWorker("eng", 1, {
      workerPath: `${base}/worker.min.js`,
      corePath: `${base}/core`,
      langPath: `${base}/lang`,
    }).catch((err) => { workerPromise = null; throw err; }));
  return workerPromise;
}

async function ocr(source: Blob | HTMLCanvasElement, progress?: Progress): Promise<ScanResult> {
  progress?.("Loading scanner…");
  const worker = await getWorker();
  progress?.("Scanning…");
  const canvas = await prepareForOcr(source);
  const { data } = await worker.recognize(canvas);
  return { text: data.text, confidence: data.confidence / 100, engine: "tesseract" };
}

async function scanPdf(file: Blob, progress?: Progress): Promise<ScanResult> {
  progress?.("Reading PDF…");
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await doc.getPage(1);

  // Emailed receipts usually contain real text: rebuild lines from text positions.
  const content = await page.getTextContent();
  const rows = new Map<number, { x: number; s: string }[]>();
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const y = Math.round(item.transform[5] / 3) * 3;
    const x = item.transform[4];
    rows.set(y, [...(rows.get(y) ?? []), { x, s: item.str }]);
  }
  const text = [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" "))
    .join("\n");
  if (text.replace(/\s/g, "").length > 30) return { text, confidence: 0.95, engine: "pdf-text" };

  // Scanned PDF: render page 1 and OCR it.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
  return ocr(canvas, progress);
}

export function scanReceipt(file: Blob, progress?: Progress): Promise<ScanResult> {
  return file.type === "application/pdf" ? scanPdf(file, progress) : ocr(file, progress);
}
