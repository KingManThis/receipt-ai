import type { Session } from "@supabase/supabase-js";

/** A friendly first name: profile name if set, otherwise the part of the email before "@". */
export function displayName(session: Session | null, fullName?: string | null): string {
  const fromProfile = fullName?.trim().split(/\s+/)[0];
  if (fromProfile) return fromProfile;
  const local = session?.user.email?.split("@")[0] ?? "";
  const word = local.split(/[._\-+\d]+/).find(Boolean) ?? "";
  return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "there";
}

export function timeGreeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
