import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "install-dismissed";

function readDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** "Install app" card: one-tap install on Android/Chrome/Edge, instructions on iPhone/iPad. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
  }

  if (installed || dismissed) return null;
  const ios = isIos();
  if (!event && !ios) return null;

  return (
    <div className="card install">
      <img src={import.meta.env.BASE_URL + "icons/icon-192.png"} alt="" width={44} height={44} />
      <div className="install-text">
        <strong>Add ReceiptPilot to your home screen</strong>
        {ios ? (
          <span className="muted small-text">
            Tap <b>Share</b> <span aria-hidden>⎋</span> then <b>Add to Home Screen</b>. It opens like an app, straight to your receipts.
          </span>
        ) : (
          <span className="muted small-text">Open it like an app, straight to the camera.</span>
        )}
      </div>
      <div className="install-actions">
        {event && (
          <button className="btn small" onClick={async () => {
            await event.prompt();
            const { outcome } = await event.userChoice;
            if (outcome === "accepted") setInstalled(true);
            setEvent(null);
          }}>Install</button>
        )}
        <button className="link small-text" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
