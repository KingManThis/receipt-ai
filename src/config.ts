// Change the product name in one place.
export const APP_NAME = "ReceiptPilot";
export const APP_TAGLINE = "AI receipt scanner & expense tracker for freelancers";

/**
 * How receipts are read for FREE-plan users:
 * - "free":   on-device text recognition (Tesseract.js + pdf.js). No cost, no keys, lower accuracy.
 * - "claude": Claude via the extract-receipt Edge Function. Best accuracy, ~1-2 cents per receipt.
 * Pro users always get Claude (falling back to on-device reading if it's unavailable).
 */
export const RECEIPT_READER: "free" | "claude" = "free";

/**
 * Paid plan. Leave STRIPE_PAYMENT_LINK empty to show Pro as "coming soon".
 * - STRIPE_PAYMENT_LINK: a Stripe Payment Link for the Pro subscription (https://buy.stripe.com/...).
 * - STRIPE_PORTAL_LINK: your Stripe customer portal login link (https://billing.stripe.com/p/login/...).
 */
export const PRO_PRICE_LABEL = "$6 / month";
export const STRIPE_PAYMENT_LINK = "";
export const STRIPE_PORTAL_LINK = "";
export const PRO_FEATURES = [
  "AI receipt reading (Claude) for the best accuracy on crumpled, faded and handwritten receipts",
  "Smarter automatic categories",
  "Everything in Free",
];
