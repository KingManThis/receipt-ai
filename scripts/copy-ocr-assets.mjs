// Copies the on-device OCR engine and English language data into public/ so the site serves them itself
// (no third-party CDN at runtime). Runs before dev and build; the copied files are git-ignored.
import { cpSync, mkdirSync } from "node:fs";

const out = "public/tesseract";
mkdirSync(`${out}/core`, { recursive: true });
mkdirSync(`${out}/lang`, { recursive: true });

cpSync("node_modules/tesseract.js/dist/worker.min.js", `${out}/worker.min.js`);
for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  cpSync(`node_modules/tesseract.js-core/tesseract-core-${variant}.wasm.js`, `${out}/core/tesseract-core-${variant}.wasm.js`);
}
cpSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", `${out}/lang/eng.traineddata.gz`);
console.log("OCR assets copied to", out);
