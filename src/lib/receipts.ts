import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Category = { id: string; name: string; schedule_c_line: string | null; deductible_percent: number };

export type ReceiptStatus = "processing" | "needs_review" | "confirmed" | "failed";

export type Receipt = {
  id: string;
  image_path: string | null;
  vendor: string | null;
  receipt_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string;
  category_id: string | null;
  payment_method: string | null;
  notes: string | null;
  ai_confidence: number | null;
  ai_raw: { uncertain_fields?: string[]; is_receipt?: boolean; error?: string } | null;
  status: ReceiptStatus;
  created_at: string;
  categories?: { name: string } | null;
};

export const STATUS_LABEL: Record<ReceiptStatus, string> = {
  processing: "Reading…",
  needs_review: "Needs review",
  confirmed: "Confirmed",
  failed: "Couldn't read",
};

export const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories").select("id, name, schedule_c_line, deductible_percent").order("name");
  if (error) throw error;
  return data ?? [];
}

export function formatMoney(amount: number | null, currency = "USD"): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

/** Shrink photos to at most 2000px JPEG before upload: faster, cheaper, and plenty for reading text. */
async function prepareFile(file: File): Promise<Blob> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_BYTES) throw new Error("PDF is larger than 10 MB");
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) return blob;
  } catch {
    // Browser can't decode this format (e.g. HEIC outside Safari).
  }
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= MAX_BYTES) return file;
  throw new Error("This image format isn't supported here. Try a JPG or PNG, or take the photo from the app.");
}

/**
 * Upload one file, create its receipt row, and ask the AI to read it.
 * Upload problems throw; an AI failure still returns the receipt id (with aiError) so it can be filled in by hand.
 */
export async function uploadAndExtract(file: File, userId: string): Promise<{ id: string; aiError?: string }> {
  const blob = await prepareFile(file);
  const ext = blob.type === "application/pdf" ? "pdf" : blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("receipts").upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (upErr) throw new Error("Upload failed: " + upErr.message);

  const { data: row, error: insErr } = await supabase
    .from("receipts").insert({ image_path: path, status: "processing" }).select("id").single();
  if (insErr || !row) throw new Error("Could not save receipt: " + (insErr?.message ?? "unknown error"));

  try {
    await extract(row.id);
    return { id: row.id };
  } catch (err) {
    return { id: row.id, aiError: err instanceof Error ? err.message : "The AI couldn't read this receipt." };
  }
}

/** Run (or re-run) AI reading for a receipt. Throws a friendly message on failure. */
export async function extract(receiptId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("extract-receipt", { body: { receipt_id: receiptId } });
  if (!error) return;
  let message = "The AI couldn't read this receipt. You can fill it in by hand.";
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (body?.error === "limit_reached") {
      message = `You've used your ${body.limit} free AI reads this month. You can still fill receipts in by hand.`;
    } else if (body?.error) {
      message = body.error;
    }
  }
  throw new Error(message);
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function deleteReceipt(receipt: Pick<Receipt, "id" | "image_path">): Promise<void> {
  if (receipt.image_path) await supabase.storage.from("receipts").remove([receipt.image_path]);
  const { error } = await supabase.from("receipts").delete().eq("id", receipt.id);
  if (error) throw error;
}
