// Keeps open tabs and installed apps from running an outdated copy after a new deploy.
// Old copies can try to load files that no longer exist ("Importing a module script failed").

declare const __BUILD_ID__: string;
export const BUILD_ID = __BUILD_ID__;

const RELOAD_KEY = "reloaded-for-update";

/** Reload once to pick up the new version. Returns false if we already tried (avoids loops). */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* storage unavailable: still reload once */ }
  window.location.reload();
  return true;
}

/** Dynamic import that recovers from a stale deploy by reloading onto the new version. */
export async function importFresh<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (reloadForNewVersion()) {
      await new Promise(() => {}); // page is reloading
    }
    throw new Error("The app was just updated. Please refresh the page and try again.", { cause: err });
  }
}

/** Ask the server which version is live. */
export async function liveBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { build?: string }).build ?? null;
  } catch {
    return null;
  }
}

// Vite fires this when a lazily loaded file fails to download (typically after a deploy).
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});
