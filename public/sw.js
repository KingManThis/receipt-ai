// Service worker: makes the app installable and fast to reopen.
// - Page loads: network first, fall back to the cached page when offline.
// - Built files, icons and the OCR engine: cache first (built file names change when their content does).
// - Supabase (data, logins, images) is never cached: it's on another origin and always goes to the network.
const CACHE = "receiptpilot-v3";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Cache each page under its own URL (app shell, guides, privacy...), so offline fallbacks never mix them up.
    const appShell = new URL("./", self.registration.scope).href;
    const key = url.pathname.endsWith("/index.html") ? appShell : url.origin + url.pathname;
    event.respondWith((async () => {
      try {
        // Revalidate with the server every time so a new deploy is picked up immediately.
        const res = await fetch(req, { cache: "no-cache" });
        if (res.ok) (await caches.open(CACHE)).put(key, res.clone());
        return res;
      } catch {
        return (await caches.match(key)) ?? (key === appShell ? Response.error() : (await caches.match(appShell)) ?? Response.error());
      }
    })());
    return;
  }

  if (/\/(assets|tesseract|icons)\//.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
  }
});
