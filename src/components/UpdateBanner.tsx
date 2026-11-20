import { useEffect, useState } from "react";
import { BUILD_ID, liveBuildId } from "../lib/appVersion";

/** Shows "New version available" when the site has been updated since this copy loaded. */
export function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let stopped = false;
    const check = async () => {
      const live = await liveBuildId();
      if (!stopped && live && live !== BUILD_ID) setOutdated(true);
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    check();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 5 * 60_000);
    return () => { stopped = true; document.removeEventListener("visibilitychange", onVisible); clearInterval(timer); };
  }, []);

  if (!outdated) return null;
  return (
    <div className="update-banner no-print" role="status">
      <span>✨ A new version of ReceiptPilot is ready.</span>
      <button className="btn small" onClick={() => window.location.reload()}>Update now</button>
    </div>
  );
}
