import { createClient } from "@supabase/supabase-js";

// Trim, and treat empty strings as missing: an unset GitHub variable arrives as "".
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || undefined;
// Supabase now calls this the "publishable" key; older projects call it the "anon" key. Either works.
const anonKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  undefined;

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

/** Which sign-in providers are switched on in Supabase (e.g. Google), so the UI only offers working ones. */
export async function enabledProviders(): Promise<Record<string, boolean>> {
  if (!supabaseConfigured) return {};
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey! } });
    if (!res.ok) return {};
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return body.external ?? {};
  } catch {
    return {};
  }
}
