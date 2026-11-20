import { createClient } from "@supabase/supabase-js";

// Trim, and treat empty strings as missing: an unset GitHub variable arrives as "".
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// A placeholder client keeps the app renderable before Supabase is configured;
// the UI shows a setup notice in that case.
export const supabase = createClient(
  supabaseConfigured ? url! : "https://placeholder.supabase.co",
  supabaseConfigured ? anonKey! : "placeholder-anon-key",
  // PKCE returns "?code=..." in the query string, which doesn't clash with HashRouter's "#/route".
  { auth: { flowType: "pkce" } },
);

/** Absolute URL of the app root, used for email-confirmation and OAuth redirects. */
export function appUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}
