// Change the product name in one place.
export const APP_NAME = "ReceiptPilot";
export const APP_TAGLINE = "AI receipt scanner & expense tracker for freelancers";

/**
 * How receipts are read:
 * - "free":   on-device text recognition (Tesseract.js + pdf.js). No cost, no keys, lower accuracy.
 * - "claude": Claude via the extract-receipt Edge Function. Best accuracy, ~1-2 cents per receipt.
 */
export const RECEIPT_READER: "free" | "claude" = "free";
