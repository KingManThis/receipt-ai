// Supabase Edge Function: reads a receipt image/PDF with Claude and fills in the receipt row.
// Called from the browser with { receipt_id } and the user's login token.
// Secrets needed (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import Anthropic from "npm:@anthropic-ai/sdk@1.11.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const FREE_MONTHLY_LIMIT = 20;
const MODEL = "claude-opus-5-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

type Extraction = {
  is_receipt: boolean;
  vendor: string | null;
  receipt_date: string | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  currency: string | null;
  payment_method: string | null;
  category: string;
  description: string | null;
  confidence: number;
  uncertain_fields: string[];
};

function schema(categoryNames: string[]) {
  const num = { type: ["number", "null"] };
  const str = { type: ["string", "null"] };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "is_receipt", "vendor", "receipt_date", "subtotal", "tax", "tip", "total",
      "currency", "payment_method", "category", "description", "confidence", "uncertain_fields",
    ],
    properties: {
      is_receipt: { type: "boolean", description: "False if the image is not a receipt, invoice or bill." },
      vendor: { ...str, description: "Business name as a person would write it, e.g. 'Starbucks', not the legal entity." },
      receipt_date: { ...str, description: "Purchase date as YYYY-MM-DD." },
      subtotal: { ...num, description: "Amount before tax and tip." },
      tax: { ...num, description: "Sales tax / VAT amount." },
      tip: { ...num, description: "Tip or gratuity, if any." },
      total: { ...num, description: "Final amount paid." },
      currency: { ...str, description: "ISO 4217 code, e.g. USD." },
      payment_method: { ...str, description: "e.g. 'Visa •1234', 'Cash', 'Apple Pay'." },
      category: { type: "string", enum: categoryNames, description: "Best-fitting expense category." },
      description: { ...str, description: "Under 12 words: what was bought." },
      confidence: { type: "number", description: "0 to 1: how sure you are about the vendor, date and total overall." },
      uncertain_fields: {
        type: "array",
        items: { type: "string", enum: ["vendor", "receipt_date", "subtotal", "tax", "tip", "total", "category"] },
        description: "Fields that are blurry, cut off, ambiguous or guessed.",
      },
    },
  };
}

const SYSTEM = `You read receipts for a US freelancer's expense tracker. Extract exactly what is printed.
Use null for anything not shown; never invent amounts or dates. If the year is missing, assume the most recent past date.
Amounts are plain numbers without currency symbols. Pick the category a US accountant would use on IRS Schedule C;
restaurant and cafe purchases are "Meals (business)"; software, apps and SaaS are "Software & subscriptions".
List a field in uncertain_fields whenever you had to guess.`;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1. Who is calling?
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Not signed in" }, 401);
  const userId = userData.user.id;

  const { receipt_id } = await req.json().catch(() => ({}));
  if (typeof receipt_id !== "string") return json({ error: "receipt_id is required" }, 400);

  // 2. Load the receipt, making sure it belongs to this user.
  const { data: receipt } = await admin
    .from("receipts").select("id, image_path, user_id")
    .eq("id", receipt_id).eq("user_id", userId).single();
  if (!receipt?.image_path) return json({ error: "Receipt not found" }, 404);

  // 3. Free-plan limit.
  const { data: profile } = await admin.from("profiles").select("plan").eq("id", userId).single();
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const { data: usage } = await admin
    .from("usage").select("receipts_processed").eq("user_id", userId).eq("month", month).maybeSingle();
  const used = usage?.receipts_processed ?? 0;
  if (profile?.plan !== "pro" && used >= FREE_MONTHLY_LIMIT) {
    await admin.from("receipts").update({ status: "needs_review", notes: "Monthly free limit reached: fill in by hand or upgrade." }).eq("id", receipt_id);
    return json({ error: "limit_reached", limit: FREE_MONTHLY_LIMIT }, 402);
  }

  const fail = async (message: string, status = 500) => {
    await admin.from("receipts").update({ status: "failed", ai_raw: { error: message } }).eq("id", receipt_id);
    return json({ error: message }, status);
  };

  // 4. Download the file.
  const { data: file, error: dlErr } = await admin.storage.from("receipts").download(receipt.image_path);
  if (dlErr || !file) return fail("Could not read the uploaded file");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = file.type || "image/jpeg";
  const data = toBase64(bytes);

  const fileBlock = mediaType === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
    : {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: (["image/png", "image/webp", "image/gif"].includes(mediaType) ? mediaType : "image/jpeg") as
          "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data,
      },
    };

  // 5. Categories the AI may choose from.
  const { data: categories } = await admin
    .from("categories").select("id, name").or(`user_id.is.null,user_id.eq.${userId}`);
  const names = (categories ?? []).map((c) => c.name);
  if (names.length === 0) return fail("No categories found: run the database setup");

  // 6. Ask Claude.
  let result: Extraction;
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: schema(names) } },
      system: SYSTEM,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: "Extract this receipt." }] }],
    });
    if (response.stop_reason === "refusal") return fail("The AI declined to read this file", 422);
    if (response.stop_reason === "max_tokens") return fail("The AI response was cut off", 502);
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    result = JSON.parse(text) as Extraction;
  } catch (err) {
    console.error(err);
    if (err instanceof Anthropic.RateLimitError) return fail("AI is busy, try again in a minute", 429);
    if (err instanceof Anthropic.AuthenticationError) return fail("AI key is missing or invalid", 500);
    if (err instanceof Anthropic.APIError) return fail(`AI error (${err.status})`, 502);
    return fail("Could not read the receipt", 500);
  }

  // 7. Count usage (only for successful AI calls).
  await admin.from("usage").upsert(
    { user_id: userId, month, receipts_processed: used + 1 },
    { onConflict: "user_id,month" },
  );

  // 8. Save.
  const category = (categories ?? []).find((c) => c.name === result.category);
  const validDate = result.receipt_date && /^\d{4}-\d{2}-\d{2}$/.test(result.receipt_date) ? result.receipt_date : null;
  const update = {
    vendor: result.vendor,
    receipt_date: validDate,
    subtotal: result.subtotal,
    tax: result.tax,
    total: result.total,
    currency: (result.currency ?? "USD").toUpperCase().slice(0, 3),
    payment_method: result.payment_method,
    category_id: category?.id ?? null,
    notes: [result.description, result.tip ? `Tip: ${result.tip}` : null].filter(Boolean).join(" · ") || null,
    ai_confidence: Math.max(0, Math.min(1, result.confidence)),
    ai_raw: result,
    status: "needs_review",
  };
  const { error: saveErr } = await admin.from("receipts").update(update).eq("id", receipt_id);
  if (saveErr) return fail("Could not save the result");

  return json({ ok: true, is_receipt: result.is_receipt, uncertain_fields: result.uncertain_fields });
});
