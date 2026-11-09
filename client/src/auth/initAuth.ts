import { clearCallbackError } from "./authCallback";
import { useAuth } from "./context";
import { guestUsage } from "./guestUsage";

// Call once at startup (outside React, so StrictMode can't double-register).
export function initAuth() {
  const { refresh } = useAuth.getState();
  clearCallbackError();
  void refresh().catch(() => {});
  // Returning with browser Back must not leave the Google button stuck.
  const recheck = () => { if (document.visibilityState === "visible" && !useAuth.getState().isProcessing) void refresh().catch(() => {}); };
  window.addEventListener("focus", recheck);
  window.addEventListener("pageshow", () => { useAuth.setState({ isProcessing: false }); recheck(); });
  document.addEventListener("visibilitychange", recheck);
  window.addEventListener("storage", () => useAuth.setState({ guestCount: guestUsage.count() }));
}
